import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { MatchType, TriggerScope } from "@prisma/client";
import { authMiddleware } from "../middleware/auth.middleware";

export const triggerController = new Elysia({ prefix: "/triggers" })
    .use(authMiddleware)
    .guard({ isSignIn: true })
    .get("/", async ({ query, user }) => {
        const { botId, flowId } = query as { botId?: string, flowId?: string };

        const where: any = {};
        if (botId) {
            where.botId = botId;
            where.bot = { orgId: user!.orgId };
        }
        if (flowId) {
            where.flowId = flowId;
        }
        // Always ensure org isolation: if no botId filter, scope via bot relation
        if (!botId) {
            where.bot = { orgId: user!.orgId };
        }

        return prisma.trigger.findMany({
            where,
            include: { flow: true },
            orderBy: { createdAt: "desc" }
        });
    })
    .get("/:id", async ({ params: { id }, set, user }) => {
        const trigger = await prisma.trigger.findFirst({
            where: {
                id,
                bot: { orgId: user!.orgId },
            },
        });
        if (!trigger) {
            set.status = 404;
            return "Trigger not found";
        }
        return trigger;
    })
    .post("/", async ({ body, set, user }) => {
        // body is typed by Elysia's t.Object() below

        if (!body.flowId) {
            set.status = 400;
            return "flowId is required";
        }

        // Verify bot belongs to org
        const bot = await prisma.bot.findFirst({ where: { id: body.botId, orgId: user!.orgId } });
        if (!bot) {
            set.status = 403;
            return "Bot not found or not in your organization";
        }

        try {
            const trigger = await prisma.trigger.create({
                data: {
                    botId: body.botId,
                    keyword: body.keyword,
                    matchType: (body.matchType as MatchType) || MatchType.CONTAINS,
                    scope: (body.scope as TriggerScope) || "INCOMING",
                    isActive: body.isActive ?? true,
                    flowId: body.flowId,
                }
            });
            return trigger;
        } catch (e: unknown) {
            set.status = 500;
            return `Failed to create trigger: ${e instanceof Error ? e.message : e}`;
        }
    }, {
        body: t.Object({
            botId: t.String(),
            keyword: t.String(),
            flowId: t.String(),
            matchType: t.Optional(t.String()),
            scope: t.Optional(t.String()),
            isActive: t.Optional(t.Boolean()),
        })
    })
    .put("/:id", async ({ params: { id }, body, set, user }) => {
        // Verify trigger belongs to org via bot
        const existing = await prisma.trigger.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
        });
        if (!existing) {
            set.status = 404;
            return "Trigger not found";
        }

        try {
            const trigger = await prisma.trigger.update({
                where: { id },
                data: {
                    keyword: body.keyword,
                    matchType: body.matchType as MatchType,
                    scope: body.scope as TriggerScope,
                    isActive: body.isActive,
                    flowId: body.flowId ?? undefined,
                }
            });
            return trigger;
        } catch (_e: unknown) {
            set.status = 500;
            return "Failed to update trigger";
        }
    }, {
        body: t.Object({
            keyword: t.Optional(t.String()),
            matchType: t.Optional(t.String()),
            isActive: t.Optional(t.Boolean()),
            flowId: t.Optional(t.String()),
            scope: t.Optional(t.String()),
        }),
    })
    .delete("/:id", async ({ params: { id }, set, user }) => {
        // Verify trigger belongs to org via bot
        const existing = await prisma.trigger.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
        });
        if (!existing) {
            set.status = 404;
            return "Trigger not found";
        }

        try {
            await prisma.trigger.delete({
                where: { id }
            });
            return { success: true };
        } catch (e) {
            set.status = 500;
            return "Failed to delete trigger";
        }
    });
