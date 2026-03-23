import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { MatchType, TriggerScope } from "@prisma/client";
import { authMiddleware } from "../middleware/auth.middleware";

export const triggerController = new Elysia({ prefix: "/triggers" })
    .use(authMiddleware)
    .guard({ isSignIn: true })
    .get("/", async ({ query }) => {
        const { botId, flowId } = query as { botId?: string, flowId?: string };

        return prisma.trigger.findMany({
            where: {
                botId: botId || undefined,
                flowId: flowId || undefined
            },
            include: { flow: true },
            orderBy: { createdAt: "desc" }
        });
    })
    .get("/:id", async ({ params: { id }, set }) => {
        const trigger = await prisma.trigger.findUnique({
            where: { id }
        });
        if (!trigger) {
            set.status = 404;
            return "Trigger not found";
        }
        return trigger;
    })
    .post("/", async ({ body, set }) => {
        // body is typed by Elysia's t.Object() below

        if (!body.flowId) {
            set.status = 400;
            return "flowId is required";
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
    .put("/:id", async ({ params: { id }, body, set }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia untyped body
        const { keyword, matchType, isActive, flowId, scope } = body as any;

        try {
            const trigger = await prisma.trigger.update({
                where: { id },
                data: {
                    keyword,
                    matchType: matchType as MatchType,
                    scope: scope as TriggerScope,
                    isActive,
                    flowId: flowId ?? undefined,
                }
            });
            return trigger;
        } catch (_e: unknown) {
            set.status = 500;
            return "Failed to update trigger";
        }
    })
    .delete("/:id", async ({ params: { id }, set }) => {
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
