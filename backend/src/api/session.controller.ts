import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { BaileysService } from "../services/baileys.service";
import { aiEngine } from "../core/ai";
import { flowEngine } from "../core/flow";
import { ToolExecutor } from "../core/ai/ToolExecutor";
import { authMiddleware } from "../middleware/auth.middleware";

export const sessionController = new Elysia({ prefix: "/sessions" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // GET /sessions — List sessions with last message preview
    .get("/", async ({ query }) => {
        const { botId, search } = query;

        const where: any = {};
        if (botId) where.botId = botId;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { identifier: { contains: search, mode: "insensitive" } },
            ];
        }

        const sessions = await prisma.session.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            include: {
                messages: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { content: true, createdAt: true, fromMe: true, type: true },
                },
                _count: { select: { messages: true } },
            },
        });

        return sessions.map((s) => ({
            id: s.id,
            name: s.name,
            identifier: s.identifier,
            platform: s.platform,
            botId: s.botId,
            status: s.status,
            updatedAt: s.updatedAt,
            messageCount: s._count.messages,
            lastMessage: s.messages[0] || null,
        }));
    }, {
        query: t.Object({
            botId: t.Optional(t.String()),
            search: t.Optional(t.String()),
        }),
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

    // POST /sessions/:id/send — Send message as bot
    .post("/:id/send", async ({ params: { id }, body, set }) => {
        const session = await prisma.session.findUnique({
            where: { id },
            include: { bot: true },
        });

        if (!session) {
            set.status = 404;
            return { error: "Session not found" };
        }

        const sent = await BaileysService.sendMessage(
            session.botId,
            session.identifier,
            { text: body.text }
        );

        if (!sent) {
            set.status = 500;
            return { error: "Failed to send message — bot may not be connected" };
        }

        // Persist the sent message
        const msg = await prisma.message.create({
            data: {
                externalId: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                sessionId: id,
                sender: session.bot.identifier || "bot",
                content: body.text,
                type: "TEXT",
                fromMe: true,
                isProcessed: true,
            },
        });

        return { success: true, message: msg };
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({ text: t.String() }),
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
        } catch (err: any) {
            set.status = 500;
            return { error: err.message || "Tool execution failed" };
        }
    }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
            toolName: t.String(),
            args: t.Optional(t.Record(t.String(), t.Any())),
        }),
    });
