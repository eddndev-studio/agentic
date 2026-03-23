import { prisma } from "../../services/postgres.service";
import { Message, Trigger, TriggerScope, type Flow } from "@prisma/client";
import { TriggerMatcher } from "../matcher/TriggerMatcher";
import { BotConfigService, type BotWithTemplate } from "../../services/bot-config.service";
import { redis } from "../../services/redis.service";
import { queueService } from "../../services/queue.service";
import { eventBus } from "../../services/event-bus";
import { createLogger } from "../../logger";

const log = createLogger('FlowEngine');

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
        const textTriggers = activeTriggers.filter((t) => !t.triggerType || t.triggerType === 'TEXT');
        const match = TriggerMatcher.findMatch(message.content, textTriggers);

        // Emit emulator debug event for trigger evaluation
        if (session.identifier.startsWith('emu://')) {
            eventBus.emitBotEvent({
                type: 'emulator:debug:trigger-eval',
                botId: session.botId,
                sessionId,
                triggers: textTriggers.map(t => ({
                    name: t.keyword || t.labelName || t.id,
                    triggerType: t.triggerType || 'TEXT',
                    matched: match?.trigger.id === t.id,
                    reason: match?.trigger.id === t.id ? `Matched "${message.content}"` : undefined,
                })),
            });
        }

        if (!match) return;

        const trigger = match.trigger as Trigger & { flow: Flow | null };
        await this.startFlow(sessionId, session.botId, trigger, message.sender, session.identifier);
    }

    /**
     * Processes a label change event to see if it triggers any flow.
     */
    async processLabelEvent(sessionId: string, botId: string, labelName: string, action: 'add' | 'remove', sourceFlowId?: string) {
        const bot = await BotConfigService.loadBot(botId);
        if (!bot) { log.warn(`processLabelEvent: bot ${botId} not found`); return; }
        if (bot.paused) { log.info(`processLabelEvent: bot ${bot.name} is paused, skipping`); return; }

        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            select: { identifier: true }
        });
        if (!session) { log.warn(`processLabelEvent: session ${sessionId} not found`); return; }

        // Resolve all triggers (label triggers use scope BOTH by convention)
        const activeTriggers = await BotConfigService.resolveTriggers(bot, sessionId, [TriggerScope.INCOMING, TriggerScope.OUTGOING, TriggerScope.BOTH]);
        const botVars = BotConfigService.getVariables(bot);

        const labelAction = action.toUpperCase(); // 'ADD' | 'REMOVE'
        const labelTriggers = activeTriggers.filter((t) => t.triggerType === 'LABEL');
        log.info(`processLabelEvent: label="${labelName}" action=${labelAction} triggers=${activeTriggers.length} labelTriggers=${labelTriggers.length}`);

        for (const trigger of labelTriggers) {
            const t = trigger;
            if (t.labelAction !== labelAction) {
                log.info(`Trigger "${t.labelName}" skipped: action mismatch (trigger=${t.labelAction} event=${labelAction})`);
                continue;
            }
            if (sourceFlowId && t.flowId === sourceFlowId) continue;

            // Interpolate template variables in labelName
            const resolvedLabelName = BotConfigService.interpolate(t.labelName || '', botVars);
            if (resolvedLabelName !== labelName) {
                log.info(`Trigger skipped: name mismatch (trigger="${resolvedLabelName}" event="${labelName}")`);
                continue;
            }

            log.info(`Label trigger matched! Starting flow ${t.flowId} for session ${session.identifier}`);
            await this.startFlow(sessionId, botId, trigger as Trigger & { flow: Flow | null }, session.identifier, session.identifier);
        }
    }

    /**
     * Shared logic: validate constraints and start a flow execution.
     */
    private async startFlow(sessionId: string, botId: string, trigger: Trigger & { flow: Flow | null }, platformUserId: string, sessionIdentifier?: string) {
        if (!trigger.flow) {
            log.error(`Trigger '${trigger.keyword}' has no flow`);
            return;
        }
        const flow = trigger.flow; // narrowed to non-null
        const isEmulator = sessionIdentifier?.startsWith('emu://') || platformUserId.startsWith('emu://');

        const triggerLabel = trigger.keyword || trigger.labelName || trigger.id;
        const lockKey = `flow:lock:${sessionId}:${trigger.flowId}`;
        const lockAcquired = await redis.set(lockKey, "1", "EX", 30, "NX");

        if (!lockAcquired) {
            log.info(`Trigger '${triggerLabel}' ignored: Lock already held`);
            return;
        }

        try {
            const execution = await prisma.$transaction(async (tx) => {
                // Validate Cooldown
                if (flow.cooldownMs > 0) {
                    const lastExecution = await tx.execution.findFirst({
                        where: { sessionId, flowId: trigger.flowId },
                        orderBy: { startedAt: 'desc' }
                    });
                    if (lastExecution) {
                        const elapsed = Date.now() - lastExecution.startedAt.getTime();
                        if (elapsed < flow.cooldownMs) {
                            throw new Error(`COOLDOWN:${elapsed}/${flow.cooldownMs}`);
                        }
                    }
                }

                // Validate Usage Limit
                if (flow.usageLimit > 0) {
                    const usageCount = await tx.execution.count({
                        where: { sessionId, flowId: trigger.flowId }
                    });
                    if (usageCount >= flow.usageLimit) {
                        throw new Error(`LIMIT:${usageCount}/${flow.usageLimit}`);
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
                if (flow.excludesFlows && flow.excludesFlows.length > 0) {
                    const conflictCount = await tx.execution.count({
                        where: { sessionId, flowId: { in: flow.excludesFlows } }
                    });
                    if (conflictCount > 0) {
                        throw new Error(`EXCLUDED: Mutually exclusive flow already executed.`);
                    }
                }

                log.info(`Matched Trigger '${triggerLabel}' -> Flow ${trigger.flowId}`);

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
                flowName: flow.name,
                sessionId,
            });

            if (isEmulator) {
                eventBus.emitBotEvent({
                    type: 'emulator:debug:flow-event',
                    botId,
                    sessionId,
                    flowName: flow.name,
                    event: 'started',
                });
            }

            await this.scheduleStep(execution.id, 0);

        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            let errorMessage = errMsg;

            if (errMsg?.startsWith('SELF_TRIGGER')) {
                log.info(`Trigger '${triggerLabel}' ignored: Flow already running for this session`);
                return;
            } else if (errMsg?.startsWith('COOLDOWN:')) {
                log.info(`Trigger '${triggerLabel}' ignored: Cooldown active`);
                errorMessage = `Cooldown active (${errMsg.replace('COOLDOWN:', '')}ms)`;
            } else if (errMsg?.startsWith('LIMIT:')) {
                log.info(`Trigger '${triggerLabel}' ignored: Usage limit reached`);
                errorMessage = `Usage limit reached`;
            } else if (errMsg?.startsWith('EXCLUDED:')) {
                log.info(`Trigger '${triggerLabel}' ignored: ${errMsg}`);
                errorMessage = errMsg;
            } else {
                log.error('Error starting flow:', error);
            }

            if (['COOLDOWN:', 'LIMIT:', 'EXCLUDED:'].some(p => errMsg?.startsWith(p))) {
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
                    flowName: flow.name,
                    sessionId,
                    error: errorMessage,
                });

                if (isEmulator) {
                    eventBus.emitBotEvent({
                        type: 'emulator:debug:flow-event',
                        botId,
                        sessionId,
                        flowName: flow.name,
                        event: 'failed',
                        error: errorMessage,
                    });
                }
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
            log.info(`Flow ${execution.flowId} finished.`);
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

            if (execution.session.identifier.startsWith('emu://')) {
                eventBus.emitBotEvent({
                    type: 'emulator:debug:flow-event',
                    botId: execution.session.botId,
                    sessionId: execution.sessionId,
                    flowName: execution.flow.name,
                    event: 'completed',
                });
            }
            return;
        }

        // Calculate Delay + Jitter
        const base = step.delayMs;
        const variance = (base * step.jitterPct) / 100;
        const jitter = Math.floor(Math.random() * (variance * 2 + 1)) - variance; // +/- variance
        const finalDelay = Math.max(0, base + jitter);

        log.info(`Scheduling Step ${step.order} in ${finalDelay}ms`);

        await queueService.scheduleStepExecution(executionId, step.id, finalDelay);
    }

    /**
     * Called by the Worker when a step is successfully processed.
     * Advances to the next step in the sequence.
     */
    async completeStep(executionId: string, currentStepOrder: number) {
        log.info(`Completing Step ${currentStepOrder} for Execution ${executionId}`);

        // Update DB (Optional: track per-step completion time or logs)
        // await prisma.executionStepLog.create(...) 

        // Schedule next
        await this.scheduleStep(executionId, currentStepOrder + 1);
    }
}
