import { Elysia, t } from "elysia";
import { EmulatorService } from "../services/emulator.service";
import { prisma } from "../services/postgres.service";
import { authMiddleware } from "../middleware/auth.middleware";

export const emulatorController = new Elysia({ prefix: "/emulator" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // Create emulator session
    .post("/sessions", async ({ body, set }) => {
        try {
            const session = await EmulatorService.createSession(body.botId);
            return session;
        } catch (e: unknown) {
            set.status = 400;
            return { error: e instanceof Error ? e.message : 'Failed to create session' };
        }
    }, {
        body: t.Object({ botId: t.String() }),
    })

    // Send message as virtual user
    .post("/sessions/:id/message", async ({ params: { id }, body, set }) => {
        try {
            const message = await EmulatorService.injectMessage(
                id,
                body.content,
                body.type || 'TEXT',
                body.mediaUrl,
            );
            return message;
        } catch (e: unknown) {
            set.status = 400;
            return { error: e instanceof Error ? e.message : 'Failed to inject message' };
        }
    }, {
        body: t.Object({
            content: t.String(),
            type: t.Optional(t.String()),
            mediaUrl: t.Optional(t.String()),
        }),
    })

    // Get messages
    .get("/sessions/:id/messages", async ({ params: { id }, query }) => {
        const limit = Number(query.limit) || 100;
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
        return { data: messages.reverse(), pagination: { total, limit, offset } };
    })

    // Reset session (clear messages, keep session)
    .post("/sessions/:id/reset", async ({ params: { id }, set }) => {
        try {
            await EmulatorService.resetSession(id);
            return { success: true };
        } catch (e: unknown) {
            set.status = 400;
            return { error: e instanceof Error ? e.message : 'Failed to reset' };
        }
    })

    // Destroy session
    .delete("/sessions/:id", async ({ params: { id }, set }) => {
        try {
            await EmulatorService.destroySession(id);
            return { success: true };
        } catch (e: unknown) {
            set.status = 400;
            return { error: e instanceof Error ? e.message : 'Failed to destroy' };
        }
    });
