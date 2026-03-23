import { prisma } from "../../services/postgres.service";
import { redis } from "../../services/redis.service";
import { getAIProvider } from "../../services/ai";
import { ConversationService } from "../../services/conversation.service";
import { BaileysService } from "../../services/baileys.service";
import { BotConfigService } from "../../services/bot-config.service";
import { flowEngine } from "../flow";
import { ToolExecutor } from "./ToolExecutor";
import { TranscriptionService, VisionService, PDFService } from "../../services/media";
import * as fs from "fs";
import { isRemoteUrl } from "../../utils/helpers";
import type { AIMessage, AIToolDefinition, AIProvider, AICompletionRequest, AICompletionResponse } from "../../services/ai";
import type { Message } from "@prisma/client";
import { eventBus } from "../../services/event-bus";
import { BUILTIN_TOOLS } from "./builtin-tools";
import { sanitizeOutgoing } from "./sanitize";

const MAX_TOOL_ITERATIONS = 10;
const LOCK_TTL = 300; // seconds (5 min — high-effort thinking models can take a while)
const PENDING_QUEUE_KEY = (sid: string) => `ai:pending:${sid}`;
const MAX_PENDING_RETRIES = 3;

/** Maps primary model to a cheaper Gemini fallback */
const FALLBACK_MAP: Record<string, { provider: "GEMINI" | "OPENAI"; model: string }> = {
    GEMINI: { provider: "OPENAI", model: "gpt-5-mini" },
    OPENAI: { provider: "GEMINI", model: "gemini-2.5-flash" },
};

export class AIEngine {

    /**
     * Process a single message. Convenience wrapper around processMessages.
     */
    async processMessage(sessionId: string, message: Message): Promise<void> {
        return this.processMessages(sessionId, [message]);
    }

    /**
     * Process a batch of accumulated messages as a single AI call.
     * Each message is preprocessed (audio→transcription, image→vision, PDF→text)
     * and the results are combined into a single user message.
     */
    async processMessages(sessionId: string, messages: Message[]): Promise<void> {
        // 1. Load session + bot (with template)
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: { bot: { include: { template: true } } },
        });

        if (!session || !session.bot) {
            console.error(`[AIEngine] Session ${sessionId} or bot not found`);
            return;
        }

        if (session.bot.paused) return;

        const bot = session.bot;
        const aiConfig = BotConfigService.resolveAIConfig(bot);

        // 2. Backward compatibility: delegate to FlowEngine if AI not enabled
        if (!aiConfig.aiEnabled) {
            for (const msg of messages) {
                await flowEngine.processIncomingMessage(sessionId, msg);
            }
            return;
        }
        const botVars = BotConfigService.getVariables(bot);

        // Interpolate bot variables into the system prompt
        if (aiConfig.systemPrompt) {
            aiConfig.systemPrompt = BotConfigService.interpolate(aiConfig.systemPrompt, botVars);
        }
        const lockKey = `ai:lock:${sessionId}`;
        const pendingKey = PENDING_QUEUE_KEY(sessionId);

        // 3. Acquire distributed lock — if held, queue messages for later processing
        const lockAcquired = await redis.set(lockKey, "1", "EX", LOCK_TTL, "NX");
        if (!lockAcquired) {
            // Queue messages in Redis so they're processed after the lock is released
            const serialized = JSON.stringify(messages.map(m => m.id));
            await redis.rpush(pendingKey, serialized);
            await redis.expire(pendingKey, LOCK_TTL + 30);
            console.log(`[AIEngine] Lock held for session ${sessionId}, queued ${messages.length} message(s)`);
            return;
        }

        // Heartbeat: renew lock TTL periodically to survive long processing (transcription + tools)
        const lockHeartbeat = setInterval(() => {
            redis.expire(lockKey, LOCK_TTL).catch(() => {}); // fire-and-forget: non-critical
        }, (LOCK_TTL / 3) * 1000);

        try {
            // 4. Mark all messages as read + show typing indicator
            const msgIds = messages.map(m => m.externalId).filter(Boolean);
            if (msgIds.length > 0) {
                await BaileysService.markRead(bot.id, session.identifier, msgIds);
            }
            await BaileysService.sendPresence(bot.id, session.identifier, "composing");

            // 5. Preprocess multimodal content for each message in the batch
            const contentParts: string[] = [];
            const localFilesToCleanup: string[] = [];

            for (const msg of messages) {
                let partContent = msg.content || "";
                const metadata = (msg.metadata as any) || {};
                const mediaUrl = metadata.mediaUrl;

                if (mediaUrl) {
                    // Track local files for cleanup after processing
                    if (!isRemoteUrl(mediaUrl)) {
                        localFilesToCleanup.push(mediaUrl);
                    }

                    try {
                        if (msg.type === "AUDIO") {
                            const transcription = await TranscriptionService.transcribe(mediaUrl);
                            partContent = `[Audio transcription]: ${transcription}`;
                        } else if (msg.type === "IMAGE") {
                            const description = await VisionService.analyze(mediaUrl, "Describe this image.", bot.aiProvider);
                            partContent = partContent
                                ? `${partContent}\n[Image description]: ${description}`
                                : `[Image description]: ${description}`;
                        } else if (msg.type === "DOCUMENT" && mediaUrl.toLowerCase().endsWith(".pdf")) {
                            const pdfText = await PDFService.extractText(mediaUrl);
                            partContent = `[PDF content]: ${pdfText.substring(0, 3000)}`;
                        }
                    } catch (mediaError: any) {
                        console.error(`[AIEngine] Media preprocessing error:`, mediaError);
                        partContent = partContent || "[Media file received but could not be processed]";
                    }
                }

                if (partContent) {
                    const prefix = msg.externalId ? `[msg:${msg.externalId}] ` : "";
                    contentParts.push(`${prefix}${partContent}`);
                }
            }

            // Clean up local media files after processing (fire-and-forget)
            for (const filePath of localFilesToCleanup) {
                fs.unlink(filePath, (err) => {
                    if (err && err.code !== 'ENOENT') {
                        console.warn(`[AIEngine] Failed to clean up media file ${filePath}:`, err.message);
                    }
                });
            }

            const userContent = contentParts.length > 0
                ? contentParts.join("\n\n")
                : "[empty message]";

            const userMessage: AIMessage = { role: "user", content: userContent };
            await ConversationService.addMessage(sessionId, userMessage);

            // 5. Load tools from DB (template or bot) + inject builtins
            const tools = await BotConfigService.resolveTools(bot);

            const dbToolDefs: AIToolDefinition[] = tools.map((t) => ({
                name: t.name,
                description: BotConfigService.interpolate(t.description, botVars),
                parameters: (t.parameters as Record<string, any>) || { type: "object", properties: {} },
            }));

            // Append builtins that don't collide with DB tools (DB has priority)
            const dbToolNames = new Set(dbToolDefs.map((t) => t.name));
            const filteredBuiltins = BUILTIN_TOOLS.filter((b) => !dbToolNames.has(b.name));
            const toolDefinitions: AIToolDefinition[] = [...dbToolDefs, ...filteredBuiltins];

            // 6. Build messages array
            const history = await ConversationService.getHistory(sessionId);
            const aiMessages: AIMessage[] = [];

            if (aiConfig.systemPrompt) {
                aiMessages.push({ role: "system", content: aiConfig.systemPrompt });
            }

            aiMessages.push(...history);

            // 7. Get AI provider and call (with automatic fallback)
            let activeProvider = getAIProvider(aiConfig.aiProvider as any);
            let activeModel = aiConfig.aiModel;
            let usedFallback = false;

            const chatRequest: AICompletionRequest = {
                model: activeModel,
                messages: aiMessages,
                tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                temperature: aiConfig.temperature,
                thinkingLevel: aiConfig.thinkingLevel ?? "LOW",
            };

            let response = await this.chatWithFallback(
                activeProvider, chatRequest, aiConfig.aiProvider
            );

            // If fallback was used, switch provider for the rest of the conversation
            if (response._fallback) {
                const fb = FALLBACK_MAP[aiConfig.aiProvider];
                activeProvider = getAIProvider(fb.provider);
                activeModel = fb.model;
                usedFallback = true;
            }

            // 8. Tool call loop
            let iterations = 0;
            let messageSentByTool = false;
            const repliedMessageIds = new Set<string>();
            const executedFlowTools = new Set<string>();
            while (response.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
                iterations++;

                // Add assistant message with tool calls to history
                const assistantMsg: AIMessage = {
                    role: "assistant",
                    content: response.content,
                    toolCalls: response.toolCalls,
                };
                await ConversationService.addMessage(sessionId, assistantMsg);

                // Execute each tool call
                const toolMessages: AIMessage[] = [];
                let anyToolExecuted = false;
                for (const toolCall of response.toolCalls) {

                    // Prevent reply_to_message loops: skip if same message_id already replied
                    if (toolCall.name === "reply_to_message" && toolCall.arguments.message_id) {
                        if (repliedMessageIds.has(toolCall.arguments.message_id)) {
                            console.log(`[AIEngine] Skipping duplicate reply_to_message for ${toolCall.arguments.message_id}`);
                            toolMessages.push({
                                role: "tool",
                                content: "Mensaje duplicado, omitido.",
                                toolCallId: toolCall.id,
                                name: toolCall.name,
                            });
                            continue;
                        }
                        repliedMessageIds.add(toolCall.arguments.message_id);
                    }

                    // Prevent duplicate flow executions: skip if same tool already sent messages
                    if (executedFlowTools.has(toolCall.name)) {
                        console.log(`[AIEngine] Skipping duplicate flow tool '${toolCall.name}'`);
                        toolMessages.push({
                            role: "tool",
                            content: `El flujo "${toolCall.name}" ya fue ejecutado en este turno y el cliente ya recibió esa respuesta.`,
                            toolCallId: toolCall.id,
                            name: toolCall.name,
                        });
                        continue;
                    }

                    // Interpolate bot variables in tool call arguments
                    const interpolatedArgs: Record<string, any> = {};
                    for (const [k, v] of Object.entries(toolCall.arguments)) {
                        interpolatedArgs[k] = typeof v === "string" ? BotConfigService.interpolate(v, botVars) : v;
                    }
                    const interpolatedToolCall = { ...toolCall, arguments: interpolatedArgs };

                    console.log(`[AIEngine] Executing tool: ${interpolatedToolCall.name}(${JSON.stringify(interpolatedToolCall.arguments)})`);

                    const result = await ToolExecutor.execute(
                        bot.id,
                        session,
                        interpolatedToolCall,
                        messages[messages.length - 1],
                        bot
                    );

                    anyToolExecuted = true;
                    if (result.sentMessages) {
                        messageSentByTool = true;
                        executedFlowTools.add(toolCall.name);
                    }

                    const resultStr = typeof result.data === "string"
                        ? result.data
                        : JSON.stringify(result.data);

                    toolMessages.push({
                        role: "tool",
                        content: resultStr,
                        toolCallId: toolCall.id,
                        name: toolCall.name,
                    });
                }

                // If all tool calls were deduped (none actually executed), break the loop
                if (!anyToolExecuted) {
                    console.log(`[AIEngine] All tool calls deduped, breaking tool loop`);
                    await ConversationService.addMessages(sessionId, toolMessages);
                    break;
                }

                await ConversationService.addMessages(sessionId, toolMessages);

                // Re-call AI with updated history (use active provider, which may be fallback)
                const updatedHistory = await ConversationService.getHistory(sessionId);
                const updatedMessages: AIMessage[] = [];
                if (aiConfig.systemPrompt) {
                    updatedMessages.push({ role: "system", content: aiConfig.systemPrompt });
                }
                updatedMessages.push(...updatedHistory);

                const loopRequest: AICompletionRequest = {
                    model: activeModel,
                    messages: updatedMessages,
                    tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                    temperature: aiConfig.temperature,
                    thinkingLevel: aiConfig.thinkingLevel ?? "LOW",
                };

                response = await this.chatWithFallback(
                    activeProvider, loopRequest, usedFallback ? FALLBACK_MAP[aiConfig.aiProvider].provider : aiConfig.aiProvider
                );

                if (response._fallback && !usedFallback) {
                    const fb = FALLBACK_MAP[aiConfig.aiProvider];
                    activeProvider = getAIProvider(fb.provider);
                    activeModel = fb.model;
                    usedFallback = true;
                }
            }

            // 9. Stop typing + send final response
            await BaileysService.sendPresence(bot.id, session.identifier, "paused");

            // AI is tool/flow-oriented: NEVER send the LLM's text response to the user.
            // Only tools (reply_to_message, flows, etc.) can send messages to the end user.
            // We still persist the response in conversation history so the AI has context.
            const finalContent = response.content?.trim();
            const sanitized = finalContent ? sanitizeOutgoing(finalContent) : "";
            const hasContent = sanitized.length > 0;

            if (hasContent) {
                const assistantMsg: AIMessage = { role: "assistant", content: sanitized };
                await ConversationService.addMessage(sessionId, assistantMsg);
            }

            // 10. Update metadata on recent ConversationLog entries (async, fire-and-forget)
            this.logMetadata(sessionId, activeModel, response.usage?.totalTokens).catch(e => console.warn('[AIEngine] logMetadata failed:', (e as Error).message));

        } catch (error: any) {
            console.error(`[AIEngine] Error processing message for session ${sessionId}:`, error);
            // Tool-oriented mode: do NOT send error messages to the end user
        } finally {
            // 11. Stop heartbeat + release lock
            clearInterval(lockHeartbeat);
            await redis.del(lockKey);

            // 12. Drain pending queue — process messages that arrived while lock was held
            this.drainPending(sessionId).catch(err => {
                console.error(`[AIEngine] drainPending error for session ${sessionId}:`, err);
            });
        }
    }

    /**
     * Call provider.chat() with automatic fallback to the alternate provider on failure.
     * Returns the response with a `_fallback` flag if the fallback was used.
     */
    private async chatWithFallback(
        primary: AIProvider,
        request: AICompletionRequest,
        primaryName: string
    ): Promise<AICompletionResponse & { _fallback?: boolean }> {
        try {
            return await primary.chat(request);
        } catch (primaryError: any) {
            const fb = FALLBACK_MAP[primaryName];
            if (!fb) throw primaryError; // No fallback configured

            console.warn(
                `[AIEngine] ${primaryName} failed (${primaryError.message}), falling back to ${fb.provider}/${fb.model}`
            );

            try {
                const fallbackProvider = getAIProvider(fb.provider);
                const fallbackResponse = await fallbackProvider.chat({
                    ...request,
                    model: fb.model,
                });
                return { ...fallbackResponse, _fallback: true };
            } catch (fallbackError: any) {
                console.error(
                    `[AIEngine] Fallback ${fb.provider} also failed:`, fallbackError.message
                );
                // Throw the original error — both providers are down
                throw primaryError;
            }
        }
    }

    /**
     * Drain queued messages that arrived while the AI lock was held.
     * Loops until the pending queue is empty to avoid orphaned batches.
     */
    private async drainPending(sessionId: string): Promise<void> {
        const pendingKey = PENDING_QUEUE_KEY(sessionId);

        try {
            // Collect ALL pending batches in one pass
            const allMessageIds: string[] = [];
            let item: string | null;
            while ((item = await redis.lpop(pendingKey))) {
                try {
                    const ids: string[] = JSON.parse(item);
                    allMessageIds.push(...ids);
                } catch (parseErr) {
                    console.error(`[AIEngine] drainPending: invalid JSON in pending queue:`, parseErr);
                }
            }

            if (allMessageIds.length === 0) return;

            // Deduplicate IDs (same message could have been queued twice in edge cases)
            const uniqueIds = [...new Set(allMessageIds)];

            const messages = await prisma.message.findMany({
                where: { id: { in: uniqueIds } },
                orderBy: { createdAt: "asc" },
            });

            if (messages.length > 0) {
                console.log(`[AIEngine] Draining ${messages.length} pending message(s) for session ${sessionId}`);
                await this.processMessages(sessionId, messages);
            }
        } catch (e) {
            console.error(`[AIEngine] drainPending error:`, e);
        }
    }

    private async logMetadata(
        sessionId: string, model: string, tokenCount?: number
    ): Promise<void> {
        await prisma.conversationLog.updateMany({
            where: { sessionId, model: null },
            data: { model, ...(tokenCount != null ? { tokenCount } : {}) },
        });
    }
}
