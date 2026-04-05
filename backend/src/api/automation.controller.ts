import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { authMiddleware } from "../middleware/auth.middleware";
import type { AutomationEvent } from "@prisma/client";
import { handlePrismaError } from "../utils/prisma-errors";

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
        // Verify bot belongs to org
        const bot = await prisma.bot.findFirst({ where: { id, orgId: user!.orgId } });
        if (!bot) {
            set.status = 403;
            return { error: "Bot not found or not in your organization" };
        }

        return prisma.automation.create({
            data: {
                botId: id,
                name: body.name,
                description: body.description ?? null,
                enabled: body.enabled ?? true,
                event: body.event as AutomationEvent,
                labelName: body.labelName,
                timeoutMs: body.timeoutMs,
                prompt: body.prompt,
            },
        });
    }, {
        body: t.Object({
            name: t.String(),
            event: t.String(),
            timeoutMs: t.Number(),
            prompt: t.String(),
            description: t.Optional(t.String()),
            enabled: t.Optional(t.Boolean()),
            labelName: t.Optional(t.String()),
        }),
    })

    // Update automation
    .put("/:id/automations/:automationId", async ({ params: { automationId }, body, set, user }) => {
        // Verify automation belongs to org via bot
        const existing = await prisma.automation.findFirst({
            where: { id: automationId, bot: { orgId: user!.orgId } },
        });
        if (!existing) {
            set.status = 404;
            return { error: "Automation not found" };
        }

        const data: Record<string, unknown> = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.description !== undefined) data.description = body.description;
        if (body.enabled !== undefined) data.enabled = body.enabled;
        if (body.event !== undefined) data.event = body.event;
        if (body.labelName !== undefined) data.labelName = body.labelName;
        if (body.timeoutMs !== undefined) data.timeoutMs = body.timeoutMs;
        if (body.prompt !== undefined) data.prompt = body.prompt;

        try {
            return await prisma.automation.update({ where: { id: automationId }, data });
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Automation");
            set.status = status;
            return body;
        }
    }, {
        body: t.Object({
            name: t.Optional(t.String()),
            description: t.Optional(t.String()),
            enabled: t.Optional(t.Boolean()),
            event: t.Optional(t.String()),
            labelName: t.Optional(t.String()),
            timeoutMs: t.Optional(t.Number()),
            prompt: t.Optional(t.String()),
        }),
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
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Automation");
            set.status = status;
            return body;
        }
    });
