import { Elysia } from "elysia";
import { prisma } from "../services/postgres.service";
import { authMiddleware } from "../middleware/auth.middleware";

export const automationController = new Elysia({ prefix: "/bots" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // List automations for a bot
    .get("/:id/automations", async ({ params: { id }, user }) => {
        return prisma.automation.findMany({
            where: { botId: id, bot: { orgId: user!.orgId } },
            orderBy: { createdAt: "desc" },
        });
    })

    // Create automation
    .post("/:id/automations", async ({ params: { id }, body, set, user }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia untyped body
        const { name, description, enabled, event, labelName, timeoutMs, prompt } = body as any;

        if (!name || !event || !timeoutMs || !prompt) {
            set.status = 400;
            return { error: "name, event, timeoutMs, and prompt are required" };
        }

        // Verify bot belongs to org
        const bot = await prisma.bot.findFirst({ where: { id, orgId: user!.orgId } });
        if (!bot) {
            set.status = 403;
            return { error: "Bot not found or not in your organization" };
        }

        return prisma.automation.create({
            data: {
                botId: id,
                name,
                description: description || null,
                enabled: enabled ?? true,
                event,
                labelName,
                timeoutMs,
                prompt,
            },
        });
    })

    // Update automation
    .put("/:id/automations/:automationId", async ({ params: { automationId }, body, set, user }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia untyped body
        const { name, description, enabled, event, labelName, timeoutMs, prompt } = body as any;

        // Verify automation belongs to org via bot
        const existing = await prisma.automation.findFirst({
            where: { id: automationId, bot: { orgId: user!.orgId } },
        });
        if (!existing) {
            set.status = 404;
            return { error: "Automation not found" };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma partial update
        const data: any = {};
        if (name !== undefined) data.name = name;
        if (description !== undefined) data.description = description;
        if (enabled !== undefined) data.enabled = enabled;
        if (event !== undefined) data.event = event;
        if (labelName !== undefined) data.labelName = labelName;
        if (timeoutMs !== undefined) data.timeoutMs = timeoutMs;
        if (prompt !== undefined) data.prompt = prompt;

        try {
            return await prisma.automation.update({ where: { id: automationId }, data });
        } catch (_e: unknown) {
            set.status = 404;
            return { error: "Automation not found" };
        }
    })

    // Delete automation
    .delete("/:id/automations/:automationId", async ({ params: { automationId }, set, user }) => {
        // Verify automation belongs to org via bot
        const existing = await prisma.automation.findFirst({
            where: { id: automationId, bot: { orgId: user!.orgId } },
        });
        if (!existing) {
            set.status = 404;
            return { error: "Automation not found" };
        }

        try {
            await prisma.automation.delete({ where: { id: automationId } });
            return { success: true };
        } catch (_e: unknown) {
            set.status = 404;
            return { error: "Automation not found" };
        }
    });
