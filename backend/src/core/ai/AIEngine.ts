import { prisma } from "../../services/postgres.service";
import { redis } from "../../services/redis.service";
import { getAIProvider } from "../../services/ai";
import { ConversationService } from "../../services/conversation.service";
import { BaileysService } from "../../services/baileys.service";
import { flowEngine } from "../flow";
import { ToolExecutor } from "./ToolExecutor";
import { TranscriptionService, VisionService, PDFService } from "../../services/media";
import type { AIMessage, AIToolDefinition, AIToolCall } from "../../services/ai";
import type { Message } from "@prisma/client";

const MAX_TOOL_ITERATIONS = 5;
const LOCK_TTL = 60; // seconds

export class AIEngine {

    /**
     * Main entry point for processing a message.
     * Delegates to FlowEngine for non-AI bots.
     */
    async processMessage(sessionId: string, message: Message): Promise<void> {
        // 1. Load session + bot
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: { bot: true },
        });

        if (!session || !session.bot) {
            console.error(`[AIEngine] Session ${sessionId} or bot not found`);
            return;
        }

        // 2. Backward compatibility: delegate to FlowEngine if AI not enabled
        if (!session.bot.aiEnabled) {
            return flowEngine.processIncomingMessage(sessionId, message);
        }

        const bot = session.bot;
        const lockKey = `ai:lock:${sessionId}`;

        // 3. Acquire distributed lock
        const lockAcquired = await redis.set(lockKey, "1", "EX", LOCK_TTL, "NX");
        if (!lockAcquired) {
            console.log(`[AIEngine] Lock held for session ${sessionId}, skipping`);
            return;
        }

        try {
            // 4. Preprocess multimodal content
            let userContent = message.content || "";
            const metadata = (message.metadata as any) || {};
            const mediaUrl = metadata.mediaUrl;

            if (mediaUrl) {
                try {
                    if (message.type === "AUDIO") {
                        const transcription = await TranscriptionService.transcribe(mediaUrl);
                        userContent = `[Audio transcription]: ${transcription}`;
                    } else if (message.type === "IMAGE") {
                        const description = await VisionService.analyze(mediaUrl, "Describe this image.", bot.aiProvider);
                        userContent = userContent
                            ? `${userContent}\n[Image description]: ${description}`
                            : `[Image description]: ${description}`;
                    } else if (message.type === "DOCUMENT" && mediaUrl.toLowerCase().endsWith(".pdf")) {
                        const pdfText = await PDFService.extractText(mediaUrl);
                        userContent = `[PDF content]: ${pdfText.substring(0, 3000)}`;
                    }
                } catch (mediaError: any) {
                    console.error(`[AIEngine] Media preprocessing error:`, mediaError);
                    userContent = userContent || "[Media file received but could not be processed]";
                }
            }

            if (!userContent) userContent = "[empty message]";
            const userMessage: AIMessage = { role: "user", content: userContent };
            await ConversationService.addMessage(sessionId, userMessage);

            // 5. Load tools from DB
            const tools = await prisma.tool.findMany({
                where: { botId: bot.id, status: "ACTIVE" },
            });

            const toolDefinitions: AIToolDefinition[] = tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: (t.parameters as Record<string, any>) || { type: "object", properties: {} },
            }));

            // 6. Build messages array
            const history = await ConversationService.getHistory(sessionId);
            const messages: AIMessage[] = [];

            if (bot.systemPrompt) {
                messages.push({ role: "system", content: bot.systemPrompt });
            }

            messages.push(...history);

            // 7. Get AI provider and call
            const provider = getAIProvider(bot.aiProvider);
            let response = await provider.chat({
                model: bot.aiModel,
                messages,
                tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                temperature: bot.temperature,
            });

            // 8. Tool call loop
            let iterations = 0;
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
                for (const toolCall of response.toolCalls) {
                    console.log(`[AIEngine] Executing tool: ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`);

                    const result = await ToolExecutor.execute(
                        bot.id,
                        session,
                        toolCall,
                        message
                    );

                    const resultStr = typeof result.data === "string"
                        ? result.data
                        : JSON.stringify(result.data);

                    toolMessages.push({
                        role: "tool",
                        content: resultStr,
                        toolCallId: toolCall.id,
                        name: toolCall.name,
                    });

                    // Log tool execution to Postgres (async, non-blocking)
                    this.logToolCall(sessionId, toolCall, result, bot.aiModel).catch(() => {});
                }

                await ConversationService.addMessages(sessionId, toolMessages);

                // Re-call AI with updated history
                const updatedHistory = await ConversationService.getHistory(sessionId);
                const updatedMessages: AIMessage[] = [];
                if (bot.systemPrompt) {
                    updatedMessages.push({ role: "system", content: bot.systemPrompt });
                }
                updatedMessages.push(...updatedHistory);

                response = await provider.chat({
                    model: bot.aiModel,
                    messages: updatedMessages,
                    tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                    temperature: bot.temperature,
                });
            }

            // 9. Send final response
            if (response.content) {
                await BaileysService.sendMessage(bot.id, session.identifier, { text: response.content });

                // Add assistant response to history
                const assistantMsg: AIMessage = { role: "assistant", content: response.content };
                await ConversationService.addMessage(sessionId, assistantMsg);
            }

            // 10. Log to Postgres (async)
            this.logConversation(sessionId, userContent, response.content, bot.aiModel, response.usage?.totalTokens).catch(() => {});

        } catch (error: any) {
            console.error(`[AIEngine] Error processing message for session ${sessionId}:`, error);

            // Try to send error message to user
            try {
                await BaileysService.sendMessage(
                    session.bot.id,
                    session.identifier,
                    { text: "Lo siento, ocurrió un error procesando tu mensaje. Intenta de nuevo." }
                );
            } catch {}
        } finally {
            // 11. Release lock
            await redis.del(lockKey);
        }
    }

    private async logConversation(
        sessionId: string, userContent: string, assistantContent: string | null,
        model: string, tokenCount?: number
    ): Promise<void> {
        await prisma.conversationLog.createMany({
            data: [
                { sessionId, role: "user", content: userContent, model },
                ...(assistantContent ? [{
                    sessionId, role: "assistant", content: assistantContent, model, tokenCount,
                }] : []),
            ],
        });
    }

    private async logToolCall(
        sessionId: string, toolCall: AIToolCall, result: { success: boolean; data: any },
        model: string
    ): Promise<void> {
        await prisma.conversationLog.create({
            data: {
                sessionId,
                role: "tool",
                toolName: toolCall.name,
                toolArgs: toolCall.arguments,
                toolResult: { success: result.success, data: result.data },
                model,
            },
        });
    }
}
