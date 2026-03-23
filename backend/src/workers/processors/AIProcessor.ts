/**
 * AI Processing worker handler.
 * Runs AIEngine logic off the main event loop, using HTTP calls
 * back to the main process for Baileys operations (send, markRead, presence, tools).
 */
import { Job } from "bullmq";
import { prisma } from "../../services/postgres.service";
import { redis } from "../../services/redis.service";
import { getAIProvider } from "../../services/ai";
import { ConversationService } from "../../services/conversation.service";
import { BotConfigService } from "../../services/bot-config.service";
import { TranscriptionService, VisionService, PDFService } from "../../services/media";
import { mainProcessClient } from "../../services/main-process-client";
import { buildChatContext } from "../../services/chat-context.service";
import { BUILTIN_TOOLS } from "../../core/ai/builtin-tools";
import { sanitizeOutgoing } from "../../core/ai/sanitize";
import * as fs from "fs";
import { isRemoteUrl, updateMessageMetadata } from "../../utils/helpers";
import { safeParseMessageMetadata } from "../../schemas";
import type { AIMessage, AIToolDefinition, AIProvider, AICompletionRequest, AICompletionResponse } from "../../services/ai";

interface AIJobData {
    sessionId: string;
    messageIds: string[];
}

const MAX_TOOL_ITERATIONS = 10;
const LOCK_TTL = 300; // seconds (5 min)
const PENDING_QUEUE_KEY = (sid: string) => `ai:pending:${sid}`;

const FALLBACK_MAP: Record<string, { provider: "GEMINI" | "OPENAI"; model: string }> = {
    GEMINI: { provider: "OPENAI", model: "gpt-5-mini" },
    OPENAI: { provider: "GEMINI", model: "gemini-2.5-flash" },
};

export class AIProcessor {

    static async process(job: Job<AIJobData>): Promise<void> {
        const { sessionId, messageIds } = job.data;

        const messages = await prisma.message.findMany({
            where: { id: { in: messageIds } },
            orderBy: { createdAt: "asc" },
        });

        if (messages.length === 0) {
            console.warn(`[AIProcessor] No messages found for IDs: ${messageIds.join(", ")}`);
            return;
        }

        await this.processMessages(sessionId, messages);
    }

    private static async processMessages(sessionId: string, messages: { id: string; content: string | null; type: string; externalId: string | null; metadata: any }[]): Promise<void> {
        // 1. Load session + bot (with template)
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: { bot: { include: { template: true } } },
        });

        if (!session || !session.bot) {
            console.error(`[AIProcessor] Session ${sessionId} or bot not found`);
            return;
        }

        if (session.bot.paused) return;

        const bot = session.bot;
        const aiConfig = BotConfigService.resolveAIConfig(bot);

        // Non-AI bots: flow triggers already ran on main process, nothing to do here
        if (!aiConfig.aiEnabled) return;

        const botVars = BotConfigService.getVariables(bot);

        if (aiConfig.systemPrompt) {
            aiConfig.systemPrompt = BotConfigService.interpolate(aiConfig.systemPrompt, botVars);
        }

        const lockKey = `ai:lock:${sessionId}`;
        const pendingKey = PENDING_QUEUE_KEY(sessionId);

        // 2. Acquire distributed lock
        const lockAcquired = await redis.set(lockKey, "1", "EX", LOCK_TTL, "NX");
        if (!lockAcquired) {
            const serialized = JSON.stringify(messages.map(m => m.id));
            await redis.rpush(pendingKey, serialized);
            await redis.expire(pendingKey, LOCK_TTL + 30);
            console.log(`[AIProcessor] Lock held for session ${sessionId}, queued ${messages.length} message(s)`);
            return;
        }

        const lockHeartbeat = setInterval(() => {
            redis.expire(lockKey, LOCK_TTL).catch(() => {}); // fire-and-forget: non-critical
        }, (LOCK_TTL / 3) * 1000);

        try {
            // 3. Mark read + show typing (only if autoReadReceipts is enabled)
            if (aiConfig.autoReadReceipts) {
                const msgIds = messages.map(m => m.externalId).filter(Boolean) as string[];
                if (msgIds.length > 0) {
                    await mainProcessClient.markRead(bot.id, session.identifier, msgIds).catch(e =>
                        console.warn(`[AIProcessor] markRead failed:`, e.message)
                    );
                }
                await mainProcessClient.sendPresence(bot.id, session.identifier, "composing").catch(e =>
                    console.warn(`[AIProcessor] sendPresence failed:`, e.message)
                );
            }

            // 4. Preprocess multimodal content
            const contentParts: string[] = [];
            const localFilesToCleanup: string[] = [];

            for (const msg of messages) {
                let partContent = msg.content || "";
                const metadata = safeParseMessageMetadata(msg.metadata);
                const mediaUrl = metadata.mediaUrl;

                if (mediaUrl) {
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
                        // Cache the preprocessed result in message metadata for future chat context
                        if (partContent && partContent !== msg.content) {
                            updateMessageMetadata(msg.id, { mediaDescription: partContent.substring(0, 500) })
                                .catch(e => console.warn('[AIProcessor] media description cache update failed:', (e as Error).message));
                        }
                    } catch (mediaError: any) {
                        console.error(`[AIProcessor] Media preprocessing error:`, mediaError);
                        partContent = partContent || "[Media file received but could not be processed]";
                    }
                }

                if (partContent) {
                    const prefix = msg.externalId ? `[msg:${msg.externalId}] ` : "";
                    contentParts.push(`${prefix}${partContent}`);
                }
            }

            // Clean up local media files (fire-and-forget)
            for (const filePath of localFilesToCleanup) {
                fs.unlink(filePath, (err) => {
                    if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
                        console.warn(`[AIProcessor] Failed to clean up media file ${filePath}:`, err);
                    }
                });
            }

            const userContent = contentParts.length > 0
                ? contentParts.join("\n\n")
                : "[empty message]";

            const userMessage: AIMessage = { role: "user", content: userContent };
            await ConversationService.addMessage(sessionId, userMessage);

            // 5. Load tools
            const tools = await BotConfigService.resolveTools(bot);
            const dbToolDefs: AIToolDefinition[] = tools.map((t) => ({
                name: t.name,
                description: BotConfigService.interpolate(t.description, botVars),
                parameters: (t.parameters as Record<string, any>) || { type: "object", properties: {} },
            }));

            const dbToolNames = new Set(dbToolDefs.map((t) => t.name));
            const filteredBuiltins = BUILTIN_TOOLS.filter((b) => !dbToolNames.has(b.name));
            const toolDefinitions: AIToolDefinition[] = [...dbToolDefs, ...filteredBuiltins];

            // 6. Fetch real chat history for context
            const contextCount = aiConfig.contextMessages || 20;
            const chatContextLines = await buildChatContext(sessionId, contextCount);
            const chatContext = chatContextLines.join("\n");

            // 7. Build messages array
            const history = await ConversationService.getHistory(sessionId);
            const aiMessages: AIMessage[] = [];

            if (aiConfig.systemPrompt) {
                const systemContent = chatContext
                    ? `${aiConfig.systemPrompt}\n\n--- Chat reciente ---\n${chatContext}`
                    : aiConfig.systemPrompt;
                aiMessages.push({ role: "system", content: systemContent });
            } else if (chatContext) {
                aiMessages.push({ role: "system", content: `--- Chat reciente ---\n${chatContext}` });
            }
            aiMessages.push(...history);

            // 7. AI provider call with fallback
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

            let response = await this.chatWithFallback(activeProvider, chatRequest, aiConfig.aiProvider);

            if (response._fallback) {
                const fb = FALLBACK_MAP[aiConfig.aiProvider];
                activeProvider = getAIProvider(fb.provider);
                activeModel = fb.model;
                usedFallback = true;
            }

            // 8. Tool call loop — tools execute on main process via HTTP
            let iterations = 0;
            let messageSentByTool = false;
            const repliedMessageIds = new Set<string>();
            const executedFlowTools = new Set<string>();

            while (response.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
                iterations++;

                const assistantMsg: AIMessage = {
                    role: "assistant",
                    content: response.content,
                    toolCalls: response.toolCalls,
                };
                await ConversationService.addMessage(sessionId, assistantMsg);

                const toolMessages: AIMessage[] = [];
                let anyToolExecuted = false;

                for (const toolCall of response.toolCalls) {
                    // Prevent reply_to_message loops
                    if (toolCall.name === "reply_to_message" && toolCall.arguments.message_id) {
                        if (repliedMessageIds.has(toolCall.arguments.message_id)) {
                            console.log(`[AIProcessor] Skipping duplicate reply_to_message for ${toolCall.arguments.message_id}`);
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

                    // Prevent duplicate flow executions
                    if (executedFlowTools.has(toolCall.name)) {
                        console.log(`[AIProcessor] Skipping duplicate flow tool '${toolCall.name}'`);
                        toolMessages.push({
                            role: "tool",
                            content: `El flujo "${toolCall.name}" ya fue ejecutado en este turno y el cliente ya recibió esa respuesta.`,
                            toolCallId: toolCall.id,
                            name: toolCall.name,
                        });
                        continue;
                    }

                    // Interpolate bot variables in tool arguments
                    const interpolatedArgs: Record<string, any> = {};
                    for (const [k, v] of Object.entries(toolCall.arguments)) {
                        interpolatedArgs[k] = typeof v === "string" ? BotConfigService.interpolate(v, botVars) : v;
                    }

                    console.log(`[AIProcessor] Executing tool: ${toolCall.name}(${JSON.stringify(interpolatedArgs)})`);

                    // Execute tool on main process via HTTP
                    const result = await mainProcessClient.executeTool(
                        bot.id,
                        session.id,
                        toolCall.name,
                        interpolatedArgs
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

                if (!anyToolExecuted) {
                    console.log(`[AIProcessor] All tool calls deduped, breaking tool loop`);
                    await ConversationService.addMessages(sessionId, toolMessages);
                    break;
                }

                await ConversationService.addMessages(sessionId, toolMessages);

                // Re-call AI with updated history
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

            // 9. Stop typing
            await mainProcessClient.sendPresence(bot.id, session.identifier, "paused").catch(e => console.warn('[AIProcessor] sendPresence(paused) failed:', (e as Error).message));

            // Persist final AI response in conversation history (tool-oriented: never send text directly)
            const finalContent = response.content?.trim();
            const sanitized = finalContent ? sanitizeOutgoing(finalContent) : "";
            if (sanitized.length > 0) {
                const assistantMsg: AIMessage = { role: "assistant", content: sanitized };
                await ConversationService.addMessage(sessionId, assistantMsg);
            }

            // Log metadata (fire-and-forget)
            this.logMetadata(sessionId, activeModel, response.usage?.totalTokens).catch(e => console.warn('[AIProcessor] logMetadata failed:', (e as Error).message));

        } catch (error: any) {
            console.error(`[AIProcessor] Error processing messages for session ${sessionId}:`, error);
        } finally {
            // Release lock
            clearInterval(lockHeartbeat);
            await redis.del(lockKey);

            // Drain pending queue (inline loop, not re-enqueue)
            await this.drainPending(sessionId);
        }
    }

    private static async chatWithFallback(
        primary: AIProvider,
        request: AICompletionRequest,
        primaryName: string
    ): Promise<AICompletionResponse & { _fallback?: boolean }> {
        try {
            return await primary.chat(request);
        } catch (primaryError: any) {
            const fb = FALLBACK_MAP[primaryName];
            if (!fb) throw primaryError;

            console.warn(
                `[AIProcessor] ${primaryName} failed (${primaryError.message}), falling back to ${fb.provider}/${fb.model}`
            );

            try {
                const fallbackProvider = getAIProvider(fb.provider);
                const fallbackResponse = await fallbackProvider.chat({ ...request, model: fb.model });
                return { ...fallbackResponse, _fallback: true };
            } catch (fallbackError: any) {
                console.error(`[AIProcessor] Fallback ${fb.provider} also failed:`, fallbackError.message);
                throw primaryError;
            }
        }
    }

    private static async drainPending(sessionId: string): Promise<void> {
        const pendingKey = PENDING_QUEUE_KEY(sessionId);

        try {
            const allMessageIds: string[] = [];
            let item: string | null;
            while ((item = await redis.lpop(pendingKey))) {
                try {
                    const ids: string[] = JSON.parse(item);
                    allMessageIds.push(...ids);
                } catch {
                    console.error(`[AIProcessor] drainPending: invalid JSON in pending queue`);
                }
            }

            if (allMessageIds.length === 0) return;

            const uniqueIds = [...new Set(allMessageIds)];
            const messages = await prisma.message.findMany({
                where: { id: { in: uniqueIds } },
                orderBy: { createdAt: "asc" },
            });

            if (messages.length > 0) {
                console.log(`[AIProcessor] Draining ${messages.length} pending message(s) for session ${sessionId}`);
                await this.processMessages(sessionId, messages);
            }
        } catch (e) {
            console.error(`[AIProcessor] drainPending error:`, e);
        }
    }

    private static async logMetadata(
        sessionId: string, model: string, tokenCount?: number
    ): Promise<void> {
        await prisma.conversationLog.updateMany({
            where: { sessionId, model: null },
            data: { model, ...(tokenCount != null ? { tokenCount } : {}) },
        });
    }
}
