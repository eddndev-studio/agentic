import { prisma } from "../../services/postgres.service";
import { providerRegistry } from "../../providers/registry";
import type { OutgoingPayload } from "../../providers/types";
import { BotConfigService, type BotWithTemplate } from "../../services/bot-config.service";
import { isBuiltinTool } from "./builtin-tools";
import { eventBus } from "../../services/event-bus";
import { flowEngine } from "../flow";
import { safeParseStepMetadata, safeParseToolActionConfig, safeParseNotificationChannels } from "../../schemas";
import type { Session, Tool } from "@prisma/client";

export interface ToolResult {
    success: boolean;
    data: unknown;
    /** True when this tool already sent messages to the user (flows, reply_to_message) */
    sentMessages?: boolean;
}

export class ToolExecutor {

    /**
     * Execute a tool call by looking up the tool definition and dispatching by actionType.
     * Built-in tools skip the DB lookup entirely (fast-path).
     * Supports template-based tool resolution.
     *
     * @param bot - Optional pre-loaded bot. When provided, skips the DB lookup
     *              (avoids redundant queries when called from a loop).
     */
    static async execute(
        botId: string,
        session: Session,
        toolCall: { name: string; arguments: Record<string, any> }, // eslint-disable-line @typescript-eslint/no-explicit-any
        originalMessage?: { content?: string | null },
        bot?: BotWithTemplate
    ): Promise<ToolResult> {
        const startTime = Date.now();
        let result: ToolResult;
        try {
            // Fast-path: built-in tools don't need a DB record
            if (isBuiltinTool(toolCall.name)) {
                result = await this.executeBuiltin(botId, session, { name: toolCall.name }, toolCall.arguments);
            } else {
                // Use pre-loaded bot or fall back to DB lookup
                const resolvedBot = bot ?? await BotConfigService.loadBot(botId);
                if (!resolvedBot) {
                    result = { success: false, data: `Bot '${botId}' not found.` };
                } else {
                    const tool = await BotConfigService.resolveTool(resolvedBot, toolCall.name);
                    if (!tool) {
                        result = { success: false, data: `Tool '${toolCall.name}' not found or disabled.` };
                    } else {
                        result = await this.dispatchByActionType(botId, session, tool, toolCall.arguments, resolvedBot);
                    }
                }
            }
        } catch (error: unknown) {
            console.error(`[ToolExecutor] Error executing tool '${toolCall.name}':`, error);
            result = { success: false, data: (error instanceof Error ? error.message : undefined) || "Tool execution failed" };
        }

        // Emit emulator debug event for tool execution
        if (session.identifier.startsWith('emu://')) {
            const durationMs = Date.now() - startTime;
            eventBus.emitBotEvent({
                type: 'emulator:debug:tool-call',
                botId,
                sessionId: session.id,
                toolName: toolCall.name,
                args: toolCall.arguments,
                result: result.data,
                success: result.success,
                durationMs,
            });
        }

        return result;
    }

    /**
     * Dispatch execution based on the tool's actionType.
     */
    private static async dispatchByActionType(
        botId: string,
        session: Session,
        tool: Tool,
        args: Record<string, any>,
        bot: BotWithTemplate
    ): Promise<ToolResult> {
        switch (tool.actionType) {
            case "FLOW":
                return await this.executeFlow(botId, session, tool, args, bot);
            case "WEBHOOK":
                return await this.executeWebhook(tool, args, session);
            case "BUILTIN":
                return await this.executeBuiltin(botId, session, tool, args);
            default:
                return { success: false, data: `Unknown actionType: ${tool.actionType}` };
        }
    }

    /**
     * FLOW action: Execute a sequence of steps, interpolating {{param}} placeholders
     * and bot environment variables.
     */
    private static async executeFlow(
        botId: string,
        session: Session,
        tool: Tool,
        args: Record<string, any>,
        bot: BotWithTemplate
    ): Promise<ToolResult> {
        const flowId = tool.flowId || safeParseToolActionConfig(tool.actionConfig).flowId;
        if (!flowId) {
            return { success: false, data: "No flowId configured for this tool." };
        }

        const flow = await prisma.flow.findUnique({
            where: { id: flowId },
            include: { steps: { orderBy: { order: "asc" } } },
        });

        if (!flow) {
            return { success: false, data: `Flow '${flowId}' not found.` };
        }

        // Create Execution record
        const execution = await prisma.execution.create({
            data: {
                sessionId: session.id,
                flowId,
                platformUserId: session.identifier,
                status: "RUNNING",
                currentStep: 0,
                variableContext: {},
                trigger: tool.name || flow.name,
            },
        });

        eventBus.emitBotEvent({
            type: 'flow:started',
            botId,
            flowName: flow.name,
            sessionId: session.id,
        });

        const isEmulator = session.identifier.startsWith('emu://');
        if (isEmulator) {
            eventBus.emitBotEvent({
                type: 'emulator:debug:flow-event',
                botId,
                sessionId: session.id,
                flowName: flow.name,
                event: 'started',
            });
        }

        // Use pre-loaded bot for variable interpolation (no extra DB query)
        const botVars = BotConfigService.getVariables(bot);
        const resolvedVars = BotConfigService.getResolvedVariables(bot);

        const stepResults: string[] = [];
        let sentCount = 0;
        let failCount = 0;

        const flowProvider = await providerRegistry.forBot(botId);

        for (const step of flow.steps) {
            let content = step.content || "";

            // Interpolate {{param}} placeholders from tool call arguments
            for (const [key, value] of Object.entries(args)) {
                content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
            }

            // Interpolate {{VAR}} placeholders from bot environment variables
            content = BotConfigService.interpolate(content, botVars);

            // Resolve media URL (supports {{VAR}} references)
            const mediaUrl = BotConfigService.interpolateMediaUrl(step.mediaUrl, resolvedVars);

            try {
                if (step.type === "TOOL") {
                    const metadata = safeParseStepMetadata(step.metadata);
                    const toolName = metadata.toolName;
                    if (!toolName) {
                        throw new Error("TOOL step missing toolName in metadata");
                    }
                    // Interpolate bot variables into tool args
                    const rawToolArgs = metadata.toolArgs || {};
                    const toolArgs: Record<string, any> = {};
                    for (const [k, v] of Object.entries(rawToolArgs)) {
                        toolArgs[k] = typeof v === "string" ? BotConfigService.interpolate(v, botVars) : v;
                    }
                    const toolResult = await this.executeBuiltin(botId, session, { name: toolName }, toolArgs, flowId);
                    if (!toolResult.success) {
                        throw new Error(typeof toolResult.data === "string" ? toolResult.data : JSON.stringify(toolResult.data));
                    }
                    console.log(`[ToolExecutor] Flow '${flow.name}' step ${step.order} (TOOL:${toolName}) done:`, toolResult.data);
                } else if (step.type === "TEXT" && content) {
                    await flowProvider.sendMessage(botId, session.identifier, { type: 'TEXT', text: content });
                } else if (step.type === "IMAGE" && mediaUrl) {
                    await flowProvider.sendMessage(botId, session.identifier, { type: 'IMAGE', url: mediaUrl, caption: content || undefined });
                } else if (step.type === "VIDEO" && mediaUrl) {
                    await flowProvider.sendMessage(botId, session.identifier, { type: 'VIDEO', url: mediaUrl, caption: content || undefined });
                } else if ((step.type === "AUDIO" || step.type === "PTT") && mediaUrl) {
                    await flowProvider.sendMessage(botId, session.identifier, { type: 'AUDIO', url: mediaUrl, ptt: step.type === "PTT" });
                } else if (step.type === "DOCUMENT" && mediaUrl) {
                    await flowProvider.sendMessage(botId, session.identifier, { type: 'DOCUMENT', url: mediaUrl, caption: content || undefined });
                }
                sentCount++;
                await prisma.execution.update({
                    where: { id: execution.id },
                    data: { currentStep: step.order },
                });
                console.log(`[ToolExecutor] Flow '${flow.name}' step ${step.order} (${step.type}) ok`);

                if (isEmulator) {
                    eventBus.emitBotEvent({
                        type: 'emulator:debug:flow-event',
                        botId,
                        sessionId: session.id,
                        flowName: flow.name,
                        event: 'step',
                        stepOrder: step.order,
                        stepType: step.type,
                    });
                }
            } catch (e: unknown) {
                failCount++;
                const reason = (e instanceof Error ? e.message : undefined) || "unknown error";
                stepResults.push(`paso ${step.order} (${step.type}): falló — ${reason}`);
                console.error(`[ToolExecutor] Flow '${flow.name}' step ${step.order} (${step.type}) failed:`, reason);
            }

            // Respect step delay
            if (step.delayMs > 0) {
                await new Promise((r) => setTimeout(r, step.delayMs));
            }
        }

        // Finalize Execution record
        const finalStatus = failCount === 0 ? "COMPLETED" : "FAILED";
        const errorMsg = failCount > 0 ? stepResults.join("; ") : undefined;
        await prisma.execution.update({
            where: { id: execution.id },
            data: {
                status: finalStatus,
                completedAt: new Date(),
                error: errorMsg,
            },
        });

        if (failCount === 0) {
            eventBus.emitBotEvent({
                type: 'flow:completed',
                botId,
                flowName: flow.name,
                sessionId: session.id,
            });
            if (isEmulator) {
                eventBus.emitBotEvent({
                    type: 'emulator:debug:flow-event',
                    botId,
                    sessionId: session.id,
                    flowName: flow.name,
                    event: 'completed',
                });
            }
        } else {
            eventBus.emitBotEvent({
                type: 'flow:failed',
                botId,
                flowName: flow.name,
                sessionId: session.id,
                error: errorMsg || 'Unknown error',
            });
            if (isEmulator) {
                eventBus.emitBotEvent({
                    type: 'emulator:debug:flow-event',
                    botId,
                    sessionId: session.id,
                    flowName: flow.name,
                    event: 'failed',
                    error: errorMsg || 'Unknown error',
                });
            }
        }

        const summary = failCount === 0
            ? `Flujo "${flow.name}" ejecutado (${sentCount} pasos enviados). El cliente ya recibió la respuesta.`
            : `Flujo "${flow.name}" ejecutado parcialmente: ${sentCount} enviados, ${failCount} fallidos. ${stepResults.join("; ")}`;

        return {
            success: failCount === 0,
            data: summary,
            sentMessages: sentCount > 0,
        };
    }

    /**
     * WEBHOOK action: POST to a URL with the tool arguments as body.
     */
    private static async executeWebhook(
        tool: Tool,
        args: Record<string, any>,
        session: Session
    ): Promise<ToolResult> {
        const config = safeParseToolActionConfig(tool.actionConfig);
        if (!config.url) {
            return { success: false, data: "No webhook URL configured." };
        }

        const method = (config.method || "POST").toUpperCase();
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(config.headers || {}),
        };

        const res = await fetch(config.url, {
            method,
            headers,
            body: method !== "GET" ? JSON.stringify({ ...args, sessionId: session.id, identifier: session.identifier }) : undefined,
            signal: AbortSignal.timeout(15_000),
        });

        const text = await res.text();
        let data: unknown;
        try { data = JSON.parse(text); } catch { data = text; }

        return { success: res.ok, data };
    }

    /**
     * BUILTIN action: Execute internal functions.
     */
    private static async executeBuiltin(
        botId: string,
        session: Session,
        tool: { name: string; actionConfig?: unknown },
        args: Record<string, any>,
        sourceFlowId?: string
    ): Promise<ToolResult> {
        const builtinName = tool.name || safeParseToolActionConfig(tool.actionConfig).builtinName;

        switch (builtinName) {
            case "get_current_time": {
                const tz = args.timezone || "America/Mexico_City";
                const now = new Date().toLocaleString("es-MX", { timeZone: tz });
                return { success: true, data: { time: now, timezone: tz } };
            }

            case "mark_as_read": {
                // Fetch recent unread messages to mark as read
                const recentMsgs = await prisma.message.findMany({
                    where: { sessionId: session.id, fromMe: false },
                    orderBy: { createdAt: "desc" },
                    take: 10,
                    select: { externalId: true },
                });
                const extIds = recentMsgs.map(m => m.externalId).filter(Boolean) as string[];
                const markReadProvider = await providerRegistry.forBot(botId);
                if (extIds.length > 0) {
                    await markReadProvider.markRead(botId, session.identifier, extIds);
                }
                await markReadProvider.sendPresence(botId, session.identifier, "composing");
                return { success: true, data: "Mensajes marcados como leídos." };
            }

            case "clear_conversation": {
                const { ConversationService } = await import("../../services/conversation.service");
                await ConversationService.clear(session.id);
                return { success: true, data: "Conversation history cleared." };
            }

            case "get_current_labels": {
                const currentLabels = await prisma.sessionLabel.findMany({
                    where: { sessionId: session.id },
                    include: { label: true },
                });
                return {
                    success: true,
                    data: currentLabels.map(sl => ({
                        name: sl.label.name,
                        color: sl.label.color,
                    })),
                };
            }

            case "get_labels": {
                const labels = await prisma.label.findMany({
                    where: { botId, deleted: false },
                    include: { _count: { select: { sessions: true } } },
                });
                return {
                    success: true,
                    data: labels.map(l => ({
                        name: l.name,
                        color: l.color,
                        waLabelId: l.waLabelId,
                        sessionCount: l._count.sessions,
                    })),
                };
            }

            case "assign_label": {
                const labelName = args.label_name;
                if (!labelName) {
                    return { success: false, data: "Falta el parámetro label_name." };
                }

                const label = await prisma.label.findFirst({
                    where: { botId, deleted: false, name: { equals: labelName, mode: "insensitive" } },
                });
                if (!label) {
                    return { success: false, data: `Etiqueta '${labelName}' no encontrada.` };
                }

                // Sync with WhatsApp
                const assignLabelProvider = await providerRegistry.forBot(botId);
                await assignLabelProvider.addChatLabel(botId, session.identifier, label.waLabelId);

                // Upsert in DB
                await prisma.sessionLabel.upsert({
                    where: { sessionId_labelId: { sessionId: session.id, labelId: label.id } },
                    update: {},
                    create: { sessionId: session.id, labelId: label.id },
                });

                // Mark as handled to prevent duplicate from Baileys labels.association
                await assignLabelProvider.markLabelEventHandled(botId, session.id, label.id, 'add');

                // Emit event for notifications + flow triggers
                const addedLabels = await prisma.sessionLabel.findMany({
                    where: { sessionId: session.id },
                    include: { label: true },
                });
                const assignLabelPayload = addedLabels.map(sl => ({
                    id: sl.label.id, name: sl.label.name,
                    color: sl.label.color, waLabelId: sl.label.waLabelId,
                }));
                eventBus.emitBotEvent({
                    type: 'session:labels:add',
                    botId,
                    sessionId: session.id,
                    labels: assignLabelPayload,
                    changedLabelId: label.id,
                    changedLabelName: label.name,
                });
                eventBus.emitBotEvent({
                    type: 'session:labels',
                    botId,
                    sessionId: session.id,
                    labels: assignLabelPayload,
                    changedLabelId: label.id,
                    changedLabelName: label.name,
                    action: 'add',
                });
                flowEngine.processLabelEvent(session.id, botId, label.name, 'add', sourceFlowId).catch(err => {
                    console.error(`[ToolExecutor] FlowEngine label trigger error:`, err);
                });

                return { success: true, data: `Etiqueta '${label.name}' asignada al chat.` };
            }

            case "remove_label": {
                const removeLabelName = args.label_name;
                if (!removeLabelName) {
                    return { success: false, data: "Falta el parámetro label_name." };
                }

                const labelToRemove = await prisma.label.findFirst({
                    where: { botId, deleted: false, name: { equals: removeLabelName, mode: "insensitive" } },
                });
                if (!labelToRemove) {
                    return { success: false, data: `Etiqueta '${removeLabelName}' no encontrada.` };
                }

                const existingAssoc = await prisma.sessionLabel.findUnique({
                    where: { sessionId_labelId: { sessionId: session.id, labelId: labelToRemove.id } },
                });
                if (!existingAssoc) {
                    return { success: true, data: `El chat no tiene la etiqueta '${labelToRemove.name}', se omitió.` };
                }

                // Sync with WhatsApp
                const removeLabelProvider = await providerRegistry.forBot(botId);
                await removeLabelProvider.removeChatLabel(botId, session.identifier, labelToRemove.waLabelId);

                // Remove from DB
                await prisma.sessionLabel.delete({ where: { id: existingAssoc.id } });

                // Mark as handled to prevent duplicate from Baileys labels.association
                await removeLabelProvider.markLabelEventHandled(botId, session.id, labelToRemove.id, 'remove');

                // Emit event for notifications + flow triggers
                const remainingLabels = await prisma.sessionLabel.findMany({
                    where: { sessionId: session.id },
                    include: { label: true },
                });
                const removeLabelPayload = remainingLabels.map(sl => ({
                    id: sl.label.id, name: sl.label.name,
                    color: sl.label.color, waLabelId: sl.label.waLabelId,
                }));
                eventBus.emitBotEvent({
                    type: 'session:labels:remove',
                    botId,
                    sessionId: session.id,
                    labels: removeLabelPayload,
                    changedLabelId: labelToRemove.id,
                    changedLabelName: labelToRemove.name,
                });
                eventBus.emitBotEvent({
                    type: 'session:labels',
                    botId,
                    sessionId: session.id,
                    labels: removeLabelPayload,
                    changedLabelId: labelToRemove.id,
                    changedLabelName: labelToRemove.name,
                    action: 'remove',
                });
                flowEngine.processLabelEvent(session.id, botId, labelToRemove.name, 'remove', sourceFlowId).catch(err => {
                    console.error(`[ToolExecutor] FlowEngine label trigger error:`, err);
                });

                return { success: true, data: `Etiqueta '${labelToRemove.name}' removida del chat.` };
            }

            case "get_sessions_by_label": {
                const searchLabelName = args.label_name;
                if (!searchLabelName) {
                    return { success: false, data: "Falta el parámetro label_name." };
                }
                const includeMessages = args.include_messages ?? 5;

                const targetLabel = await prisma.label.findFirst({
                    where: { botId, deleted: false, name: { equals: searchLabelName, mode: "insensitive" } },
                });
                if (!targetLabel) {
                    return { success: false, data: `Etiqueta '${searchLabelName}' no encontrada.` };
                }

                const sessionLabels = await prisma.sessionLabel.findMany({
                    where: { labelId: targetLabel.id },
                    include: {
                        session: {
                            include: {
                                messages: {
                                    orderBy: { createdAt: "desc" },
                                    take: includeMessages,
                                    select: {
                                        content: true,
                                        fromMe: true,
                                        createdAt: true,
                                        type: true,
                                    },
                                },
                            },
                        },
                    },
                });

                const result = sessionLabels.map(sl => ({
                    sessionId: sl.session.id,
                    name: sl.session.name,
                    identifier: sl.session.identifier,
                    lastMessageAt: sl.session.messages[0]?.createdAt ?? null,
                    lastMessages: sl.session.messages.reverse().map(m => ({
                        content: m.content,
                        fromMe: m.fromMe,
                        createdAt: m.createdAt,
                        type: m.type,
                    })),
                }));

                return { success: true, data: result };
            }

            case "reply_to_message": {
                const messageId = args.message_id;
                const replyText = args.text;
                if (!messageId || !replyText) {
                    return { success: false, data: "Faltan parámetros: message_id y text son obligatorios." };
                }

                const originalMsg = await prisma.message.findUnique({
                    where: { externalId: messageId },
                    include: { session: true },
                });
                if (!originalMsg) {
                    return { success: false, data: `Mensaje '${messageId}' no encontrado.` };
                }
                if (originalMsg.session.botId !== botId) {
                    return { success: false, data: "El mensaje no pertenece a este bot." };
                }

                const replyProvider = await providerRegistry.forBot(botId);
                await replyProvider.sendMessage(botId, session.identifier, {
                    type: 'REPLY',
                    text: replyText,
                    quotedId: messageId,
                    quotedSender: originalMsg.sender,
                    quotedText: originalMsg.content || "",
                });

                return { success: true, data: "Mensaje enviado.", sentMessages: true };
            }

            case "send_followup_message": {
                const targetSessionId = args.session_id;
                const messageText = args.message;
                if (!targetSessionId || !messageText) {
                    return { success: false, data: "Faltan parámetros: session_id y message son obligatorios." };
                }

                // Validate session belongs to the same bot
                const targetSession = await prisma.session.findFirst({
                    where: { id: targetSessionId, botId },
                    include: { bot: true },
                });
                if (!targetSession) {
                    return { success: false, data: `Sesión '${targetSessionId}' no encontrada o no pertenece a este bot.` };
                }

                // Send message via WhatsApp
                const followupProvider = await providerRegistry.forBot(botId);
                await followupProvider.sendMessage(botId, targetSession.identifier, { type: 'TEXT', text: messageText });

                // Persist message in DB
                await prisma.message.create({
                    data: {
                        sessionId: targetSession.id,
                        content: messageText,
                        fromMe: true,
                        type: "TEXT",
                        externalId: `followup_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                        sender: targetSession.bot.identifier || "bot",
                    },
                });

                return { success: true, data: `Mensaje de seguimiento enviado a ${targetSession.name || targetSession.identifier}.` };
            }

            case "toggle_session_ai": {
                const updated = await prisma.session.update({
                    where: { id: session.id },
                    data: { aiEnabled: !session.aiEnabled },
                });
                const state = updated.aiEnabled ? "activada" : "desactivada";
                console.log(`[ToolExecutor] toggle_session_ai: session ${session.id} -> ${state}`);
                return { success: true, data: `AI ${state} para esta sesión.` };
            }

            case "activate_session_ai": {
                await prisma.session.update({
                    where: { id: session.id },
                    data: { aiEnabled: true },
                });
                return { success: true, data: "AI activada para esta sesión." };
            }

            case "deactivate_session_ai": {
                await prisma.session.update({
                    where: { id: session.id },
                    data: { aiEnabled: false },
                });
                return { success: true, data: "AI desactivada para esta sesión." };
            }

            case "set_notification_channel": {
                // Add this session as a notification channel with all events enabled
                const currentBot = await prisma.bot.findUnique({
                    where: { id: botId },
                    select: { notificationChannels: true },
                });
                const channels = safeParseNotificationChannels(currentBot?.notificationChannels);
                if (!channels.some((ch) => ch.sessionId === session.id)) {
                    channels.push({
                        sessionId: session.id,
                        events: ['flow:completed', 'flow:failed', 'session:created', 'session:labels:add', 'session:labels:remove', 'bot:connected', 'bot:disconnected', 'tool:executed'],
                        labels: [],
                    });
                    await prisma.bot.update({
                        where: { id: botId },
                        data: { notificationChannels: channels },
                    });
                }
                const { notificationService } = await import("../../services/notification.service");
                notificationService.invalidateCache(botId);
                return {
                    success: true,
                    data: `Canal de notificaciones agregado: ${session.name || session.identifier}`,
                };
            }

            case "notify": {
                const notifyMessage = args.message;
                if (!notifyMessage) {
                    return { success: false, data: "Falta el parámetro message." };
                }

                const bot = await prisma.bot.findUnique({
                    where: { id: botId },
                    select: { notificationChannels: true },
                });

                const channels = safeParseNotificationChannels(bot?.notificationChannels);
                if (channels.length === 0) {
                    return {
                        success: false,
                        data: "No hay canales de notificaciones configurados. Usa set_notification_channel primero.",
                    };
                }

                const priority = args.priority || "normal";
                const prefix = priority === "high" ? "\u{1F534}" : priority === "low" ? "\u26AA" : "\u{1F535}";
                const formattedMsg = `${prefix} *Notificación*\n\n${notifyMessage}`;

                // Send to all notification channels
                const notifyProvider = await providerRegistry.forBot(botId);
                let sentCount = 0;
                for (const ch of channels) {
                    const notifSession = await prisma.session.findUnique({ where: { id: ch.sessionId } });
                    if (!notifSession) continue;

                    await notifyProvider.sendMessage(botId, notifSession.identifier, { type: 'TEXT', text: formattedMsg });

                    await prisma.message.create({
                        data: {
                            sessionId: notifSession.id,
                            content: formattedMsg,
                            fromMe: true,
                            type: "TEXT",
                            externalId: `notify_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                            sender: notifSession.identifier || "bot",
                        },
                    });
                    sentCount++;
                }

                return { success: true, data: `Notificación enviada a ${sentCount} canal(es) (${priority}).` };
            }

            default:
                return { success: false, data: `Unknown builtin: ${builtinName}` };
        }
    }
}
