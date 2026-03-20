import { prisma } from "../../services/postgres.service";
import { Message, Trigger, TriggerScope } from "@prisma/client";
import { TriggerMatcher } from "../matcher/TriggerMatcher";
import { BotConfigService, type BotWithTemplate } from "../../services/bot-config.service";
import { redis } from "../../services/redis.service";
import { queueService } from "../../services/queue.service";
import { eventBus } from "../../services/event-bus";

/**
 * Orchestrates the lifecycle of Flow Executions.
 */
export class FlowEngine {

    /**
     * Analyzes an incoming message to see if it triggers any flow.
     */
    async processIncomingMessage(sessionId: string, message: Message) {
        if (!message.content) return;

        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            select: { botId: true, identifier: true }
        });
        if (!session) return;

        const bot = await BotConfigService.loadBot(session.botId);
        if (!bot) return;

        const validScopes: TriggerScope[] = message.fromMe
            ? [TriggerScope.OUTGOING, TriggerScope.BOTH]
            : [TriggerScope.INCOMING, TriggerScope.BOTH];

        const activeTriggers = await BotConfigService.resolveTriggers(bot, sessionId, validScopes);

        // Only match TEXT triggers for message-based processing
        const textTriggers = activeTriggers.filter((t: any) => !t.triggerType || t.triggerType === 'TEXT');
        const match = TriggerMatcher.findMatch(message.content, textTriggers);
        if (!match) return;

        const trigger = match.trigger as Trigger & { flow: any };
        await this.startFlow(sessionId, session.botId, trigger, message.sender);
    }

    /**
     * Processes a label change event to see if it triggers any flow.
     */
    async processLabelEvent(sessionId: string, botId: string, labelName: string, action: 'add' | 'remove', sourceFlowId?: string) {
        const bot = await BotConfigService.loadBot(botId);
        if (!bot || bot.paused) return;

        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            select: { identifier: true }
        });
        if (!session) return;

        // Resolve all triggers (label triggers use scope BOTH by convention)
        const activeTriggers = await BotConfigService.resolveTriggers(bot, sessionId, [TriggerScope.INCOMING, TriggerScope.OUTGOING, TriggerScope.BOTH]);
        const botVars = BotConfigService.getVariables(bot);

        const labelAction = action.toUpperCase(); // 'ADD' | 'REMOVE'

        for (const trigger of activeTriggers) {
            const t = trigger as any;
            if (t.triggerType !== 'LABEL') continue;
            if (t.labelAction !== labelAction) continue;
            if (sourceFlowId && t.flowId === sourceFlowId) continue;

            // Interpolate template variables in labelName
            const resolvedLabelName = BotConfigService.interpolate(t.labelName || '', botVars);
            if (resolvedLabelName !== labelName) continue;

            await this.startFlow(sessionId, botId, trigger as Trigger & { flow: any }, session.identifier);
        }
    }

    /**
     * Shared logic: validate constraints and start a flow execution.
     */
    private async startFlow(sessionId: string, botId: string, trigger: Trigger & { flow: any }, platformUserId: string) {
        if (!trigger.flow) {
            console.error(`[FlowEngine] Trigger '${trigger.keyword}' has no flow`);
            return;
        }

        const triggerLabel = trigger.keyword || trigger.labelName || trigger.id;
        const lockKey = `flow:lock:${sessionId}:${trigger.flowId}`;
        const lockAcquired = await redis.set(lockKey, "1", "EX", 30, "NX");

        if (!lockAcquired) {
            console.log(`[FlowEngine] Trigger '${triggerLabel}' ignored: Lock already held`);
            return;
        }

        try {
            const execution = await prisma.$transaction(async (tx) => {
                // Validate Cooldown
                if (trigger.flow.cooldownMs > 0) {
                    const lastExecution = await tx.execution.findFirst({
                        where: { sessionId, flowId: trigger.flowId },
                        orderBy: { startedAt: 'desc' }
                    });
                    if (lastExecution) {
                        const elapsed = Date.now() - lastExecution.startedAt.getTime();
                        if (elapsed < trigger.flow.cooldownMs) {
                            throw new Error(`COOLDOWN:${elapsed}/${trigger.flow.cooldownMs}`);
                        }
                    }
                }

                // Validate Usage Limit
                if (trigger.flow.usageLimit > 0) {
                    const usageCount = await tx.execution.count({
                        where: { sessionId, flowId: trigger.flowId }
                    });
                    if (usageCount >= trigger.flow.usageLimit) {
                        throw new Error(`LIMIT:${usageCount}/${trigger.flow.usageLimit}`);
                    }
                }

                // Prevent self-triggering: skip if this flow is already running for this session
                const alreadyRunning = await tx.execution.findFirst({
                    where: { sessionId, flowId: trigger.flowId, status: 'RUNNING' }
                });
                if (alreadyRunning) {
                    throw new Error(`SELF_TRIGGER`);
                }

                // Validate Exclusions
                if (trigger.flow.excludesFlows && trigger.flow.excludesFlows.length > 0) {
                    const conflictCount = await tx.execution.count({
                        where: { sessionId, flowId: { in: trigger.flow.excludesFlows } }
                    });
                    if (conflictCount > 0) {
                        throw new Error(`EXCLUDED: Mutually exclusive flow already executed.`);
                    }
                }

                console.log(`[FlowEngine] Matched Trigger '${triggerLabel}' -> Flow ${trigger.flowId}`);

                return await tx.execution.create({
                    data: {
                        sessionId,
                        flowId: trigger.flowId,
                        platformUserId,
                        status: "RUNNING",
                        currentStep: 0,
                        variableContext: {},
                        trigger: triggerLabel
                    }
                });
            });

            eventBus.emitBotEvent({
                type: 'flow:started',
                botId,
                flowName: trigger.flow.name,
                sessionId,
            });

            await this.scheduleStep(execution.id, 0);

        } catch (error: any) {
            let errorMessage = error.message;

            if (error.message?.startsWith('SELF_TRIGGER')) {
                console.log(`[FlowEngine] Trigger '${triggerLabel}' ignored: Flow already running for this session`);
                return;
            } else if (error.message?.startsWith('COOLDOWN:')) {
                console.log(`[FlowEngine] Trigger '${triggerLabel}' ignored: Cooldown active`);
                errorMessage = `Cooldown active (${error.message.replace('COOLDOWN:', '')}ms)`;
            } else if (error.message?.startsWith('LIMIT:')) {
                console.log(`[FlowEngine] Trigger '${triggerLabel}' ignored: Usage limit reached`);
                errorMessage = `Usage limit reached`;
            } else if (error.message?.startsWith('EXCLUDED:')) {
                console.log(`[FlowEngine] Trigger '${triggerLabel}' ignored: ${error.message}`);
                errorMessage = error.message;
            } else {
                console.error(`[FlowEngine] Error starting flow:`, error);
            }

            if (['COOLDOWN:', 'LIMIT:', 'EXCLUDED:'].some(p => error.message?.startsWith(p))) {
                try {
                    await prisma.execution.create({
                        data: {
                            sessionId,
                            flowId: trigger.flowId,
                            platformUserId,
                            status: "FAILED",
                            currentStep: 0,
                            variableContext: {},
                            trigger: triggerLabel,
                            error: errorMessage,
                            completedAt: new Date()
                        }
                    });
                } catch (e) { /* Ignore log failure */ }

                eventBus.emitBotEvent({
                    type: 'flow:failed',
                    botId,
                    flowName: trigger.flow.name,
                    sessionId,
                    error: errorMessage,
                });
            }
        } finally {
            await redis.del(lockKey);
        }
    }

    /**
     * Pushes a job to the BullMQ queue to execute a specific step.
     * Calculates delay with Jitter.
     */
    async scheduleStep(executionId: string, stepOrder: number) {
        const execution = await prisma.execution.findUnique({
            where: { id: executionId },
            include: { flow: { include: { steps: true } }, session: true }
        });

        if (!execution || execution.status !== 'RUNNING') return;

        const step = execution.flow.steps
            .sort((a, b) => a.order - b.order)
            .find(s => s.order >= stepOrder && !s.aiOnly);

        if (!step) {
            console.log(`[FlowEngine] Flow ${execution.flowId} finished.`);
            await prisma.execution.update({
                where: { id: executionId },
                data: { status: "COMPLETED", completedAt: new Date() }
            });

            eventBus.emitBotEvent({
                type: 'flow:completed',
                botId: execution.session.botId,
                flowName: execution.flow.name,
                sessionId: execution.sessionId,
            });
            return;
        }

        // Calculate Delay + Jitter
        const base = step.delayMs;
        const variance = (base * step.jitterPct) / 100;
        const jitter = Math.floor(Math.random() * (variance * 2 + 1)) - variance; // +/- variance
        const finalDelay = Math.max(0, base + jitter);

        console.log(`[FlowEngine] Scheduling Step ${step.order} in ${finalDelay}ms`);

        await queueService.scheduleStepExecution(executionId, step.id, finalDelay);
    }

    /**
     * Called by the Worker when a step is successfully processed.
     * Advances to the next step in the sequence.
     */
    async completeStep(executionId: string, currentStepOrder: number) {
        console.log(`[FlowEngine] Completing Step ${currentStepOrder} for Execution ${executionId}`);

        // Update DB (Optional: track per-step completion time or logs)
        // await prisma.executionStepLog.create(...) 

        // Schedule next
        await this.scheduleStep(executionId, currentStepOrder + 1);
    }
}
