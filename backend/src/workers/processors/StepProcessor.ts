import { Job } from "bullmq";
import { prisma } from "../../services/postgres.service";
import { flowEngine } from "../../core/flow";
import { BotConfigService } from "../../services/bot-config.service";
import { Step, Execution, Session, Platform } from "@prisma/client";
import { sendMessage } from "../../services/message-sender";
import { safeParseStepMetadata } from "../../schemas";
import { createLogger } from "../../logger";

const log = createLogger('StepProcessor');

interface StepJobData {
    executionId: string;
    stepId: string;
}

export class StepProcessor {
    /**
     * Main entry point for processing the "execute_step" job.
     */
    static async process(job: Job<StepJobData>) {
        const { executionId, stepId } = job.data;

        log.info(`Processing Step ${stepId} for Execution ${executionId}`);

        // 1. Fetch Step Data
        const step = await prisma.step.findUnique({ where: { id: stepId } });
        if (!step) {
            log.error(`Step ${stepId} not found, skipping`);
            return; // Don't throw - just skip this step
        }

        const execution = await prisma.execution.findUnique({
            where: { id: executionId },
            include: { session: true }
        });

        if (!execution) {
            // Execution might have been cancelled/deleted
            log.warn(`Execution ${executionId} not found, skipping step`);
            return;
        }

        // 2. Execute Logic (with error handling)
        try {
            if (step.type === 'TOOL') {
                await this.executeToolStep(step, execution);
            } else {
                await this.executeSending(step, execution);
            }
        } catch (error: unknown) {
            const errorMsg = (error instanceof Error ? error.message : undefined) || String(error);
            log.error(`Step ${stepId} failed:`, errorMsg);

            // Log error to execution record for visibility
            await prisma.execution.update({
                where: { id: executionId },
                data: {
                    error: `Step ${step.order} (${step.type}) failed: ${errorMsg}`.substring(0, 500)
                }
            }).catch(e => log.error('Failed to update execution error:', e));

            // Continue to next step instead of retrying/crashing
        }

        // 3. Advance Flow (always advance, even on error, to prevent stuck executions)
        await flowEngine.completeStep(executionId, step.order);
    }

    private static async executeSending(step: Step, execution: Execution & { session: Session }) {
        const platform = execution.session.platform;
        const target = execution.session.identifier;
        const botId = execution.session.botId;

        // Load bot variables for interpolation
        const bot = await BotConfigService.loadBot(botId);
        const botVars = bot ? BotConfigService.getVariables(bot) : {};
        const resolvedVars = bot ? BotConfigService.getResolvedVariables(bot) : {};
        const interpolate = (text: string) => BotConfigService.interpolate(text, botVars);
        const resolveMedia = (url: string | null) => BotConfigService.interpolateMediaUrl(url, resolvedVars);

        log.info(`Executing step type ${step.type} for ${target} on ${platform}`);

        if (platform === Platform.WHATSAPP) {
            switch (step.type) {
                case 'TEXT': {
                    const textPayload: Record<string, unknown> = { text: interpolate(step.content || "") };
                    if (safeParseStepMetadata(step.metadata).linkPreview === false) {
                        textPayload.skipLinkPreview = true;
                    }
                    await sendMessage(botId, target, textPayload);
                    break;
                }
                case 'IMAGE': {
                    const imageUrl = resolveMedia(step.mediaUrl);
                    if (imageUrl) {
                        await sendMessage(botId, target, { image: { url: imageUrl }, caption: interpolate(step.content || "") });
                    } else {
                        log.warn(`IMAGE step ${step.id} has no mediaUrl after interpolation, skipping`);
                    }
                    break;
                }
                case 'VIDEO': {
                    const videoUrl = resolveMedia(step.mediaUrl);
                    if (videoUrl) {
                        await sendMessage(botId, target, { video: { url: videoUrl }, caption: interpolate(step.content || "") });
                    } else {
                        log.warn(`VIDEO step ${step.id} has no mediaUrl after interpolation, skipping`);
                    }
                    break;
                }
                case 'AUDIO':
                case 'PTT': {
                    const audioUrl = resolveMedia(step.mediaUrl);
                    if (audioUrl) {
                        await sendMessage(botId, target, { audio: { url: audioUrl }, ptt: step.type === 'PTT' });
                    } else {
                        log.warn(`${step.type} step ${step.id} has no mediaUrl after interpolation, skipping`);
                    }
                    break;
                }
                
                case 'CONDITIONAL_TIME':
                    await this.executeConditionalTime(botId, target, step, botVars, resolvedVars);
                    break;

                default:
                    log.warn(`Unsupported step type ${step.type} for WhatsApp`);
            }
        } else {
            // Fallback for other platforms (Telegram, etc.)
            log.info(`[${platform}] Sending to ${target}: ${step.type}`);
        }
    }

    private static async executeToolStep(step: Step, execution: Execution & { session: Session }) {
        const metadata = safeParseStepMetadata(step.metadata);
        const toolName = metadata.toolName;

        if (!toolName) {
            log.warn(`TOOL step ${step.id} missing toolName in metadata`);
            return;
        }

        log.info(`Executing TOOL step: ${toolName}`);

        // Execute via HTTP to the main process (which owns Baileys sessions)
        const API_BASE = `http://127.0.0.1:${process.env['PORT'] || 8080}`;
        const res = await fetch(`${API_BASE}/internal/tool`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                botId: execution.session.botId,
                sessionId: execution.session.id,
                toolName,
                toolArgs: metadata.toolArgs || {},
            }),
            signal: AbortSignal.timeout(30_000),
        });

        const result = await res.json() as { error?: string };
        if (!res.ok) {
            throw new Error(`[StepProcessor] Tool '${toolName}' HTTP ${res.status}: ${result.error || 'Unknown error'}`);
        }

        log.info(`Tool '${toolName}' result:`, result);
    }

    private static async executeConditionalTime(botId: string, target: string, step: Step, botVars?: Record<string, string>, resolvedVars?: Record<string, import("../../services/bot-config.service").ResolvedVariable>) {
        const metadata = safeParseStepMetadata(step.metadata);
        if (!Array.isArray(metadata.branches)) {
            log.warn(`CONDITIONAL_TIME step ${step.id} missing branches in metadata`);
            return;
        }

        // Get current time in Mexico City (or make configurable later)
        const now = new Date();
        const timeString = now.toLocaleTimeString("en-US", { 
            hour12: false, 
            hour: "2-digit", 
            minute: "2-digit",
            timeZone: "America/Mexico_City" 
        }); // Format "HH:mm" e.g., "09:30" or "14:05"

        // Helper to convert HH:mm to minutes for comparison
        const toMinutes = (time: string) => {
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
        };

        const currentMinutes = toMinutes(timeString);
        let matchFound = false;

        // Helpers for variable interpolation in branch content/media
        const interpolate = (text: string) =>
            botVars ? BotConfigService.interpolate(text, botVars) : text;
        const resolveMedia = (url: string | null | undefined) =>
            resolvedVars ? BotConfigService.interpolateMediaUrl(url, resolvedVars) : (url || null);

        log.info(`Conditional Time Check: Current ${timeString} (${currentMinutes}m)`);

        for (const branch of metadata.branches) {
            const start = toMinutes(branch.startTime);
            const end = toMinutes(branch.endTime);
            let isMatch = false;

            if (start < end) {
                // Standard range (e.g., 09:00 to 17:00)
                if (currentMinutes >= start && currentMinutes < end) {
                    isMatch = true;
                }
            } else {
                // Midnight crossing range (e.g., 22:00 to 06:00)
                // Match if we are AFTER start (22:00...23:59) OR BEFORE end (00:00...06:00)
                if (currentMinutes >= start || currentMinutes < end) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                log.info(`Matched Branch: ${branch.startTime} - ${branch.endTime}`);
                matchFound = true;

                // Execute the content of the branch
                const payload: Record<string, unknown> = {};
                const branchMediaUrl = resolveMedia(branch.mediaUrl);
                if (branch.type === 'TEXT') {
                    payload.text = interpolate(branch.content || "");
                } else if (branch.type === 'IMAGE' && branchMediaUrl) {
                    payload.image = { url: branchMediaUrl };
                    payload.caption = interpolate(branch.content || "");
                } else if (branch.type === 'VIDEO' && branchMediaUrl) {
                    payload.video = { url: branchMediaUrl };
                    payload.caption = interpolate(branch.content || "");
                } else if (branch.type === 'AUDIO' && branchMediaUrl) {
                    payload.audio = { url: branchMediaUrl };
                    payload.ptt = true; // Default to PTT for audio in conditional for now
                }

                if (Object.keys(payload).length > 0) {
                    await sendMessage(botId, target, payload);
                }
                break; // Stop after first match
            }
        }

        if (!matchFound && metadata.fallback) {
            log.info('No time match found, executing fallback');
            const fb = metadata.fallback;
            const payload: Record<string, unknown> = {};
            const fbMediaUrl = resolveMedia(fb.mediaUrl);

            if (fb.type === 'TEXT') {
                payload.text = interpolate(fb.content || "");
            } else if (fb.type === 'IMAGE' && fbMediaUrl) {
                payload.image = { url: fbMediaUrl };
                payload.caption = interpolate(fb.content || "");
            } else if (fb.type === 'VIDEO' && fbMediaUrl) {
                payload.video = { url: fbMediaUrl };
                payload.caption = interpolate(fb.content || "");
            } else if (fb.type === 'AUDIO' && fbMediaUrl) {
                payload.audio = { url: fbMediaUrl };
                payload.ptt = true;
            }

            if (Object.keys(payload).length > 0) {
                await sendMessage(botId, target, payload);
            }
        }
    }
}
