import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { providerRegistry } from "../providers/registry";
import { aiEngine } from "../core/ai";
import { flowEngine } from "../core/flow";
import { ToolExecutor } from "../core/ai/ToolExecutor";
import { LabelPersistenceService } from "../services/labels/label-persistence.service";
import { authMiddleware } from "../middleware/auth.middleware";

export const sessionController = new Elysia({ prefix: "/sessions" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // GET /sessions — List sessions with last message preview (paginated)
    .get("/", async ({ query, user }) => {
        const { botId, search, limit, offset, labelId } = query;
        const take = Math.min(Number(limit) || 50, 200);
        const skip = Number(offset) || 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma dynamic where clause
        const where: any = {
            // Hide emulator sessions from the production monitor
            NOT: { identifier: { startsWith: 'emu://' } },
            bot: { orgId: user!.orgId },
        };

        // WORKER: restrict to assigned bots only
        if (user!.role === "WORKER") {
            const membership = await prisma.membership.findUnique({
                where: { userId_orgId: { userId: user!.id, orgId: user!.orgId } },
                include: { workerBots: { select: { botId: true } } }
            });
            const assignedIds = membership?.workerBots.map(wb => wb.botId) ?? [];
            where.botId = botId ? (assignedIds.includes(botId) ? botId : "__none__") : { in: assignedIds };
        } else if (botId) {
            where.botId = botId;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { identifier: { contains: search, mode: "insensitive" } },
            ];
        }
        if (labelId) {
            where.labels = { some: { labelId } };
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
                notes: s.notes,
                identifier: s.identifier,
                platform: s.platform,
                botId: s.botId,
                status: s.status,
                aiEnabled: s.aiEnabled,
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
            labelId: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
        }),
    })

    // GET /sessions/labels — List all labels for a bot
    .get("/labels", async ({ query, set, user }) => {
        const { botId } = query;
        if (!botId) {
            set.status = 400;
            return { error: "botId is required" };
        }

        const labels = await prisma.label.findMany({
            where: { botId, deleted: false, bot: { orgId: user!.orgId } },
            include: { _count: { select: { sessions: true } } },
            orderBy: [{ position: "asc" }, { name: "asc" }],
        });

        return labels.map((l) => ({
            id: l.id,
            waLabelId: l.waLabelId,
            name: l.name,
            color: l.color,
            position: l.position,
            predefinedId: l.predefinedId,
            sessionCount: l._count.sessions,
        }));
    }, {
        query: t.Object({
            botId: t.Optional(t.String()),
        }),
    })

    // POST /sessions/labels/sync — Force label sync from WhatsApp
    .post("/labels/sync", async ({ body, set, user }) => {
        const { botId } = body;
        const bot = await prisma.bot.findFirst({ where: { id: botId, orgId: user!.orgId } });
        if (!bot) { set.status = 404; return { error: "Not found" }; }
        try {
            const provider = await providerRegistry.forBot(botId);
            await provider.syncLabels(botId);
            return { success: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }, {
        body: t.Object({ botId: t.String() }),
    })

    // POST /sessions/labels — Create a new label
    .post("/labels", async ({ body, set, user }) => {
        const { botId, name, color } = body;
        if (!name?.trim()) { set.status = 400; return { error: "name is required" }; }
        if (color < 0 || color > 19) { set.status = 400; return { error: "color must be 0-19" }; }
        const bot = await prisma.bot.findFirst({ where: { id: botId, orgId: user!.orgId } });
        if (!bot) { set.status = 404; return { error: "Not found" }; }
        try {
            const provider = await providerRegistry.forBot(botId);
            const { waLabelId } = await provider.createLabel(botId, name.trim(), color);
            const label = await prisma.label.findUnique({
                where: { botId_waLabelId: { botId, waLabelId } },
            });
            return { success: true, label };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            set.status = msg.includes('not connected') ? 503 : 500;
            return { error: msg };
        }
    }, {
        body: t.Object({ botId: t.String(), name: t.String(), color: t.Number() }),
    })

    // PATCH /sessions/labels/:labelId — Rename or change color
    .patch("/labels/:labelId", async ({ params: { labelId }, body, set, user }) => {
        const label = await prisma.label.findFirst({ where: { id: labelId, bot: { orgId: user!.orgId } } });
        if (!label || label.deleted) { set.status = 404; return { error: "Not found" }; }
        if (body.color !== undefined && (body.color < 0 || body.color > 19)) {
            set.status = 400; return { error: "color must be 0-19" };
        }
        try {
            const provider = await providerRegistry.forBot(label.botId);
            const data: { name?: string; color?: number } = {};
            if (body.name !== undefined) data.name = body.name;
            if (body.color !== undefined) data.color = body.color;
            await provider.updateLabel(label.botId, label.waLabelId, data);
            const updated = await prisma.label.findUnique({ where: { id: labelId } });
            return { success: true, label: updated };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            set.status = msg.includes('not connected') ? 503 : 500;
            return { error: msg };
        }
    }, {
        body: t.Object({ name: t.Optional(t.String()), color: t.Optional(t.Number()) }),
    })

    // DELETE /sessions/labels/:labelId — Soft-delete a label
    .delete("/labels/:labelId", async ({ params: { labelId }, set, user }) => {
        const label = await prisma.label.findFirst({ where: { id: labelId, bot: { orgId: user!.orgId } } });
        if (!label) { set.status = 404; return { error: "Not found" }; }
        try {
            const provider = await providerRegistry.forBot(label.botId);
            await provider.deleteLabel(label.botId, label.waLabelId);
            return { success: true };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            set.status = msg.includes('not connected') ? 503 : 500;
            return { error: msg };
        }
    })

    // PUT /sessions/labels/reorder — Update label positions
    .put("/labels/reorder", async ({ body, set, user }) => {
        const { labelIds } = body;
        try {
            // Verify all labels belong to org before reordering
            const labels = await prisma.label.findMany({
                where: { id: { in: labelIds }, bot: { orgId: user!.orgId } },
                select: { id: true },
            });
            if (labels.length !== labelIds.length) {
                set.status = 404;
                return { error: "Not found" };
            }
            await prisma.$transaction(
                labelIds.map((id: string, i: number) =>
                    prisma.label.update({ where: { id }, data: { position: i } })
                )
            );
            return { success: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }, {
        body: t.Object({ labelIds: t.Array(t.String()) }),
    })

    // GET /sessions/:id/ai-context — Debug: show exactly what the AI receives
    .get("/:id/ai-context", async ({ params: { id }, set, user }) => {
        const session = await prisma.session.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
            include: { bot: { include: { template: true } } },
        });
        if (!session || !session.bot) {
            set.status = 404;
            return { error: "Not found" };
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
    .post("/:id/labels", async ({ params: { id }, body, set, user }) => {
        const session = await prisma.session.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Not found" };
        }

        const label = await prisma.label.findUnique({ where: { id: body.labelId } });
        if (!label || label.botId !== session.botId) {
            set.status = 404;
            return { error: "Label not found" };
        }

        // Sync with messaging provider
        try {
            const provider = await providerRegistry.forBot(session.botId);
            await provider.addChatLabel(session.botId, session.identifier, label.waLabelId);
        } catch (e: unknown) {
            console.warn(`[SessionController] addChatLabel sync failed:`, (e instanceof Error ? e.message : e));
        }

        // Mark as handled + persist + emit events + trigger flows
        const addProvider = await providerRegistry.forBot(session.botId);
        addProvider.markLabelEventHandled(session.botId, id, label.id, 'add');
        await LabelPersistenceService.persistLabelAssociation(session.botId, id, label.id, 'add');

        return { success: true };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({ labelId: t.String() }),
    })

    // DELETE /sessions/:id/labels/:labelId — Remove label from session
    .delete("/:id/labels/:labelId", async ({ params: { id, labelId }, set, user }) => {
        const session = await prisma.session.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Not found" };
        }

        const label = await prisma.label.findUnique({ where: { id: labelId } });
        if (!label || label.botId !== session.botId) {
            set.status = 404;
            return { error: "Label not found" };
        }

        // Sync with messaging provider
        try {
            const provider = await providerRegistry.forBot(session.botId);
            await provider.removeChatLabel(session.botId, session.identifier, label.waLabelId);
        } catch (e: unknown) {
            console.warn(`[SessionController] removeChatLabel sync failed:`, (e instanceof Error ? e.message : e));
        }

        // Mark as handled + persist + emit events + trigger flows
        const removeProvider = await providerRegistry.forBot(session.botId);
        removeProvider.markLabelEventHandled(session.botId, id, label.id, 'remove');
        await LabelPersistenceService.persistLabelAssociation(session.botId, id, label.id, 'remove');

        return { success: true };
    }, {
        params: t.Object({ id: t.String(), labelId: t.String() }),
    })

    // GET /sessions/:id/messages — Paginated messages
    .get("/:id/messages", async ({ params: { id }, query, user }) => {
        // Verify session belongs to org
        const session = await prisma.session.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
            select: { id: true },
        });
        if (!session) { return { data: [], pagination: { total: 0, limit: 50, offset: 0 } }; }

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
    .post("/:id/send", async ({ params: { id }, body, set, user }) => {
        const session = await prisma.session.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Not found" };
        }

        // Build normalized outgoing payload
        let content: import('../providers/types').OutgoingPayload;
        let msgType = 'TEXT';

        if (body.mediaUrl && body.mediaType) {
            const url = body.mediaUrl;
            const caption = body.text || undefined;
            switch (body.mediaType) {
                case 'IMAGE':
                    content = { type: 'IMAGE', url, caption };
                    msgType = 'IMAGE';
                    break;
                case 'VIDEO':
                    content = { type: 'VIDEO', url, caption };
                    msgType = 'VIDEO';
                    break;
                case 'AUDIO':
                    content = { type: 'AUDIO', url, mimetype: 'audio/mpeg' };
                    msgType = 'AUDIO';
                    break;
                case 'PTT':
                    content = { type: 'AUDIO', url, ptt: true, mimetype: 'audio/ogg; codecs=opus' };
                    msgType = 'PTT';
                    break;
                case 'DOCUMENT':
                    content = { type: 'DOCUMENT', url, mimetype: 'application/octet-stream', fileName: body.fileName || 'file', caption };
                    msgType = 'DOCUMENT';
                    break;
                default:
                    content = { type: 'TEXT', text: body.text || '' };
            }
        } else {
            content = { type: 'TEXT', text: body.text || '' };
        }

        const sendProvider = await providerRegistry.forBot(session.botId);
        const sent = await sendProvider.sendMessage(
            session.botId,
            session.identifier,
            content
        );

        if (!sent) {
            set.status = 500;
            return { error: "Failed to send message — bot may not be connected" };
        }

        // Don't persist here — provider.sendMessage already calls
        // persistOutgoingMessage() which saves the message with the real
        // externalId and emits message:received via SSE.
        return { success: true };
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
    .post("/:id/force-ai", async ({ params: { id }, body, set, user }) => {
        const session = await prisma.session.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Not found" };
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
    .post("/:id/execute-flow", async ({ params: { id }, body, set, user }) => {
        const session = await prisma.session.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
        });

        if (!session) {
            set.status = 404;
            return { error: "Not found" };
        }

        const flow = await prisma.flow.findFirst({
            where: { id: body.flowId, bot: { orgId: user!.orgId } },
            include: { steps: { orderBy: { order: "asc" } } },
        });

        if (!flow) {
            set.status = 404;
            return { error: "Not found" };
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
    .post("/:id/execute-tool", async ({ params: { id }, body, set, user }) => {
        const session = await prisma.session.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Not found" };
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
    })

    // PATCH /sessions/:id/notes — Update session notes
    .patch("/:id/notes", async ({ params: { id }, body, set, user }) => {
        const session = await prisma.session.findFirst({ where: { id, bot: { orgId: user!.orgId } } });
        if (!session) { set.status = 404; return { error: "Not found" }; }

        const updated = await prisma.session.update({
            where: { id },
            data: { notes: body.notes },
        });
        return { success: true, notes: updated.notes };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({ notes: t.String() }),
    })

    // PATCH /sessions/:id/ai-enabled — Toggle AI per session
    .patch("/:id/ai-enabled", async ({ params: { id }, body, set, user }) => {
        const session = await prisma.session.findFirst({ where: { id, bot: { orgId: user!.orgId } } });
        if (!session) { set.status = 404; return { error: "Not found" }; }

        const updated = await prisma.session.update({
            where: { id },
            data: { aiEnabled: body.enabled },
        });
        return { success: true, aiEnabled: updated.aiEnabled };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({ enabled: t.Boolean() }),
    })

    // POST /sessions/:id/mark-read — Mark messages as read
    .post("/:id/mark-read", async ({ params: { id }, set, user }) => {
        const session = await prisma.session.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
            include: { bot: true },
        });
        if (!session) { set.status = 404; return { error: "Not found" }; }

        // Get latest unread message IDs
        const unreadMessages = await prisma.message.findMany({
            where: { sessionId: id, fromMe: false },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { externalId: true },
        });

        if (unreadMessages.length > 0) {
            const messageIds = unreadMessages
                .map(m => m.externalId)
                .filter(id => id && !id.startsWith('manual_') && !id.startsWith('force_'));

            if (messageIds.length > 0) {
                try {
                    const readProvider = await providerRegistry.forBot(session.botId);
                    await readProvider.markRead(session.botId, session.identifier, messageIds);
                } catch (e: unknown) {
                    console.warn('[SessionController] markRead failed:', (e instanceof Error ? e.message : e));
                }
            }
        }
        return { success: true };
    }, {
        params: t.Object({ id: t.String() }),
    })

    // POST /sessions/:id/react — React to a message
    .post("/:id/react", async ({ params: { id }, body, set, user }) => {
        const session = await prisma.session.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
            include: { bot: true },
        });
        if (!session) { set.status = 404; return { error: "Not found" }; }

        const message = await prisma.message.findUnique({ where: { id: body.messageId } });
        if (!message) { set.status = 404; return { error: "Message not found" }; }

        const reactProvider = await providerRegistry.forBot(session.botId);
        const sent = await reactProvider.sendMessage(session.botId, session.identifier, {
            type: 'REACTION',
            emoji: body.emoji,
            targetId: message.externalId!,
            targetSender: message.sender,
            targetFromMe: message.fromMe,
        });

        if (!sent) { set.status = 500; return { error: "Failed to send reaction" }; }
        return { success: true };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({ messageId: t.String(), emoji: t.String() }),
    });
