import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { BaileysService } from "../services/baileys.service";
import { aiEngine } from "../core/ai";
import { flowEngine } from "../core/flow";
import { ToolExecutor } from "../core/ai/ToolExecutor";
import { eventBus } from "../services/event-bus";
import { authMiddleware } from "../middleware/auth.middleware";

export const sessionController = new Elysia({ prefix: "/sessions" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // GET /sessions — List sessions with last message preview (paginated)
    .get("/", async ({ query }) => {
        const { botId, search, limit, offset } = query;
        const take = Math.min(Number(limit) || 50, 200);
        const skip = Number(offset) || 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma dynamic where clause
        const where: any = {
            // Hide emulator sessions from the production monitor
            NOT: { identifier: { startsWith: 'emu://' } },
        };
        if (botId) where.botId = botId;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { identifier: { contains: search, mode: "insensitive" } },
            ];
        }

        const [total, sessions] = await prisma.$transaction([
            prisma.session.count({ where }),
            prisma.session.findMany({
                where,
                orderBy: { updatedAt: "desc" },
                take,
                skip,
                include: {
                    messages: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { content: true, createdAt: true, fromMe: true, type: true },
                    },
                    labels: {
                        include: { label: true },
                    },
                    _count: { select: { messages: true } },
                },
            }),
        ]);

        return {
            data: sessions.map((s) => ({
                id: s.id,
                name: s.name,
                identifier: s.identifier,
                platform: s.platform,
                botId: s.botId,
                status: s.status,
                updatedAt: s.updatedAt,
                messageCount: s._count.messages,
                lastMessage: s.messages[0] || null,
                labels: s.labels.map((sl) => ({
                    id: sl.label.id,
                    name: sl.label.name,
                    color: sl.label.color,
                    waLabelId: sl.label.waLabelId,
                })),
            })),
            pagination: { total, limit: take, offset: skip },
        };
    }, {
        query: t.Object({
            botId: t.Optional(t.String()),
            search: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
        }),
    })

    // GET /sessions/labels — List all labels for a bot
    .get("/labels", async ({ query, set }) => {
        const { botId } = query;
        if (!botId) {
            set.status = 400;
            return { error: "botId is required" };
        }

        const labels = await prisma.label.findMany({
            where: { botId, deleted: false },
            include: { _count: { select: { sessions: true } } },
            orderBy: { name: "asc" },
        });

        return labels.map((l) => ({
            id: l.id,
            waLabelId: l.waLabelId,
            name: l.name,
            color: l.color,
            predefinedId: l.predefinedId,
            sessionCount: l._count.sessions,
        }));
    }, {
        query: t.Object({
            botId: t.Optional(t.String()),
        }),
    })

    // POST /sessions/labels/sync — Force label sync from WhatsApp
    .post("/labels/sync", async ({ body, set }) => {
        const { botId } = body;
        try {
            await BaileysService.syncLabels(botId);
            return { success: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }, {
        body: t.Object({ botId: t.String() }),
    })

    // GET /sessions/:id/ai-context — Debug: show exactly what the AI receives
    .get("/:id/ai-context", async ({ params: { id }, set }) => {
        const session = await prisma.session.findUnique({
            where: { id },
            include: { bot: { include: { template: true } } },
        });
        if (!session || !session.bot) {
            set.status = 404;
            return { error: "Session not found" };
        }

        const { BotConfigService } = await import("../services/bot-config.service");
        const { ConversationService } = await import("../services/conversation.service");

        const bot = session.bot;
        const aiConfig = BotConfigService.resolveAIConfig(bot);
        const botVars = BotConfigService.getVariables(bot);

        // System prompt with interpolation
        let systemPrompt = aiConfig.systemPrompt || "";
        if (systemPrompt) {
            systemPrompt = BotConfigService.interpolate(systemPrompt, botVars);
        }

        // Chat context (real messages)
        const { buildChatContext } = await import("../services/chat-context.service");
        const contextCount = aiConfig.contextMessages || 20;
        const chatContext = await buildChatContext(id, contextCount);

        // Conversation history (AI memory)
        const history = await ConversationService.getHistory(id);

        return {
            systemPrompt,
            chatContext,
            conversationHistory: history,
            config: {
                aiProvider: aiConfig.aiProvider,
                aiModel: aiConfig.aiModel,
                temperature: aiConfig.temperature,
                contextMessages: aiConfig.contextMessages,
                autoReadReceipts: aiConfig.autoReadReceipts,
            },
        };
    })

    // POST /sessions/:id/labels — Assign label to session
    .post("/:id/labels", async ({ params: { id }, body, set }) => {
        const session = await prisma.session.findUnique({
            where: { id },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Session not found" };
        }

        const label = await prisma.label.findUnique({ where: { id: body.labelId } });
        if (!label || label.botId !== session.botId) {
            set.status = 404;
            return { error: "Label not found" };
        }

        // Call Baileys to sync with WhatsApp
        try {
            await BaileysService.addChatLabel(session.botId, session.identifier, label.waLabelId);
        } catch (e: unknown) {
            console.warn(`[SessionController] addChatLabel WA sync failed:`, (e instanceof Error ? e.message : e));
        }

        // Persist in DB
        const sessionLabel = await prisma.sessionLabel.upsert({
            where: { sessionId_labelId: { sessionId: id, labelId: label.id } },
            update: {},
            create: { sessionId: id, labelId: label.id },
        });

        // Mark as handled to prevent duplicate from Baileys labels.association
        BaileysService.markLabelEventHandled(session.botId, id, label.id, 'add');

        // Emit event for notifications + flow triggers
        const updatedLabels = await prisma.sessionLabel.findMany({
            where: { sessionId: id },
            include: { label: true },
        });
        const addLabelPayload = updatedLabels.map(sl => ({
            id: sl.label.id, name: sl.label.name,
            color: sl.label.color, waLabelId: sl.label.waLabelId,
        }));
        eventBus.emitBotEvent({
            type: 'session:labels:add',
            botId: session.botId,
            sessionId: id,
            labels: addLabelPayload,
            changedLabelId: label.id,
            changedLabelName: label.name,
        });
        eventBus.emitBotEvent({
            type: 'session:labels',
            botId: session.botId,
            sessionId: id,
            labels: addLabelPayload,
            changedLabelId: label.id,
            changedLabelName: label.name,
            action: 'add',
        });
        flowEngine.processLabelEvent(id, session.botId, label.name, 'add').catch(err => {
            console.error(`[SessionController] FlowEngine label trigger error:`, err);
        });

        return { success: true, sessionLabel };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({ labelId: t.String() }),
    })

    // DELETE /sessions/:id/labels/:labelId — Remove label from session
    .delete("/:id/labels/:labelId", async ({ params: { id, labelId }, set }) => {
        const session = await prisma.session.findUnique({
            where: { id },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Session not found" };
        }

        const label = await prisma.label.findUnique({ where: { id: labelId } });
        if (!label || label.botId !== session.botId) {
            set.status = 404;
            return { error: "Label not found" };
        }

        // Call Baileys to sync with WhatsApp
        try {
            await BaileysService.removeChatLabel(session.botId, session.identifier, label.waLabelId);
        } catch (e: unknown) {
            console.warn(`[SessionController] removeChatLabel WA sync failed:`, (e instanceof Error ? e.message : e));
        }

        // Remove from DB
        await prisma.sessionLabel.deleteMany({
            where: { sessionId: id, labelId: label.id },
        });

        // Mark as handled to prevent duplicate from Baileys labels.association
        BaileysService.markLabelEventHandled(session.botId, id, label.id, 'remove');

        // Emit event for notifications + flow triggers
        const remainingLabels = await prisma.sessionLabel.findMany({
            where: { sessionId: id },
            include: { label: true },
        });
        const removeLabelPayload = remainingLabels.map(sl => ({
            id: sl.label.id, name: sl.label.name,
            color: sl.label.color, waLabelId: sl.label.waLabelId,
        }));
        eventBus.emitBotEvent({
            type: 'session:labels:remove',
            botId: session.botId,
            sessionId: id,
            labels: removeLabelPayload,
            changedLabelId: label.id,
            changedLabelName: label.name,
        });
        eventBus.emitBotEvent({
            type: 'session:labels',
            botId: session.botId,
            sessionId: id,
            labels: removeLabelPayload,
            changedLabelId: label.id,
            changedLabelName: label.name,
            action: 'remove',
        });
        flowEngine.processLabelEvent(id, session.botId, label.name, 'remove').catch(err => {
            console.error(`[SessionController] FlowEngine label trigger error:`, err);
        });

        return { success: true };
    }, {
        params: t.Object({ id: t.String(), labelId: t.String() }),
    })

    // GET /sessions/:id/messages — Paginated messages
    .get("/:id/messages", async ({ params: { id }, query }) => {
        const limit = Number(query.limit) || 50;
        const offset = Number(query.offset) || 0;

        const [total, messages] = await prisma.$transaction([
            prisma.message.count({ where: { sessionId: id } }),
            prisma.message.findMany({
                where: { sessionId: id },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
            }),
        ]);

        return {
            data: messages.reverse(),
            pagination: { total, limit, offset },
        };
    }, {
        params: t.Object({ id: t.String() }),
        query: t.Object({
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
        }),
    })

    // POST /sessions/:id/send — Send message as bot (text or media)
    .post("/:id/send", async ({ params: { id }, body, set }) => {
        const session = await prisma.session.findUnique({
            where: { id },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Session not found" };
        }

        // Build Baileys content based on mediaType
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Baileys content varies by type
        let content: any;
        let msgType = 'TEXT';
        let textContent = body.text || '';

        if (body.mediaUrl && body.mediaType) {
            const url = body.mediaUrl;
            const caption = body.text || undefined;
            switch (body.mediaType) {
                case 'IMAGE':
                    content = { image: { url }, caption };
                    msgType = 'IMAGE';
                    break;
                case 'VIDEO':
                    content = { video: { url }, caption };
                    msgType = 'VIDEO';
                    break;
                case 'AUDIO':
                    content = { audio: { url }, mimetype: 'audio/mpeg' };
                    msgType = 'AUDIO';
                    break;
                case 'PTT':
                    content = { audio: { url }, ptt: true, mimetype: 'audio/ogg; codecs=opus' };
                    msgType = 'PTT';
                    break;
                case 'DOCUMENT':
                    content = { document: { url }, mimetype: 'application/octet-stream', fileName: body.fileName || 'file', caption };
                    msgType = 'DOCUMENT';
                    break;
                default:
                    content = { text: textContent };
            }
            textContent = caption || '';
        } else {
            content = { text: textContent };
        }

        const sent = await BaileysService.sendMessage(
            session.botId,
            session.identifier,
            content
        );

        if (!sent) {
            set.status = 500;
            return { error: "Failed to send message — bot may not be connected" };
        }

        // Persist the sent message (BaileysService.sendMessage also calls persistOutgoingMessage,
        // but we persist here for manual sends to have the message returned immediately)
        const msg = await prisma.message.create({
            data: {
                externalId: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                sessionId: id,
                sender: session.bot.identifier || "bot",
                content: textContent,
                type: msgType,
                fromMe: true,
                isProcessed: true,
                ...(body.mediaUrl ? { metadata: { mediaUrl: body.mediaUrl } } : {}),
            },
        }).catch(() => null); // ignore P2002 if persistOutgoingMessage already saved it

        return { success: true, message: msg };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            text: t.Optional(t.String()),
            mediaUrl: t.Optional(t.String()),
            mediaType: t.Optional(t.String()),
            fileName: t.Optional(t.String()),
        }),
    })

    // POST /sessions/:id/force-ai — Create synthetic message + trigger AI
    .post("/:id/force-ai", async ({ params: { id }, body, set }) => {
        const session = await prisma.session.findUnique({
            where: { id },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Session not found" };
        }

        // Create a synthetic message
        const syntheticMsg = await prisma.message.create({
            data: {
                externalId: `force_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                sessionId: id,
                sender: "operator",
                content: body.context || "[Operator forced AI response]",
                type: "TEXT",
                fromMe: false,
                isProcessed: false,
            },
        });

        // Trigger AIEngine processing
        aiEngine.processMessage(id, syntheticMsg).catch((err) => {
            console.error("[SessionController] force-ai error:", err);
        });

        return { success: true, message: syntheticMsg };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({ context: t.Optional(t.String()) }),
    })

    // POST /sessions/:id/execute-flow — Execute a flow directly
    .post("/:id/execute-flow", async ({ params: { id }, body, set }) => {
        const session = await prisma.session.findUnique({ where: { id } });

        if (!session) {
            set.status = 404;
            return { error: "Session not found" };
        }

        const flow = await prisma.flow.findUnique({
            where: { id: body.flowId },
            include: { steps: { orderBy: { order: "asc" } } },
        });

        if (!flow) {
            set.status = 404;
            return { error: "Flow not found" };
        }

        // Create execution directly (bypass TriggerMatcher)
        const execution = await prisma.execution.create({
            data: {
                sessionId: id,
                flowId: body.flowId,
                platformUserId: session.identifier,
                status: "RUNNING",
                trigger: "manual",
            },
        });

        // Schedule first step
        flowEngine.scheduleStep(execution.id, 0).catch((err) => {
            console.error("[SessionController] execute-flow error:", err);
        });

        return { success: true, execution };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({ flowId: t.String() }),
    })

    // POST /sessions/:id/execute-tool — Execute a tool manually
    .post("/:id/execute-tool", async ({ params: { id }, body, set }) => {
        const session = await prisma.session.findUnique({
            where: { id },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Session not found" };
        }

        try {
            const result = await ToolExecutor.execute(
                session.botId,
                session,
                { name: body.toolName, arguments: body.args || {} }
            );
            return { success: true, result };
        } catch (err: unknown) {
            set.status = 500;
            return { error: (err instanceof Error ? err.message : undefined) || "Tool execution failed" };
        }
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            toolName: t.String(),
            args: t.Optional(t.Record(t.String(), t.Any())),
        }),
    });
