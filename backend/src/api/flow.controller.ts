import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { Prisma, StepType } from "@prisma/client";
import { syncFlowTool } from "../services/flow-tool-sync";
import { authMiddleware } from "../middleware/auth.middleware";

function mapTriggers(
    triggers: Record<string, unknown>[],
    owner: { botId?: string; templateId?: string },
) {
    return triggers.map((tr) => ({
        keyword: (tr.keyword as string) || (tr.labelName as string) || '',
        matchType: (tr.matchType as string) || 'CONTAINS',
        scope: (tr.scope as string) || 'INCOMING',
        triggerType: (tr.triggerType as string) || 'TEXT',
        labelName: (tr.labelName as string) || null,
        labelAction: (tr.labelAction as string) || null,
        ...(owner.botId ? { botId: owner.botId } : {}),
        ...(owner.templateId ? { templateId: owner.templateId } : {}),
    })) as Prisma.TriggerUncheckedCreateWithoutFlowInput[];
}

export const flowController = new Elysia({ prefix: "/flows" })
    .use(authMiddleware)
    .guard({ isSignIn: true })
    .get("/", async ({ query, user }) => {
        const { botId, templateId } = query as { botId?: string; templateId?: string };

        const where: any = {};
        if (templateId) {
            where.templateId = templateId;
            where.template = { orgId: user!.orgId };
        } else if (botId) {
            where.botId = botId;
            where.bot = { orgId: user!.orgId };
        } else {
            // No filter — return all flows for this org via bot OR template
            where.OR = [
                { bot: { orgId: user!.orgId } },
                { template: { orgId: user!.orgId } },
            ];
        }

        const flows = await prisma.flow.findMany({
            where,
            include: {
                steps: {
                    orderBy: { order: "asc" }
                },
                triggers: true
            }
        });
        return flows;
    })
    .get("/:id", async ({ params: { id }, set, user }) => {
        const flow = await prisma.flow.findFirst({
            where: {
                id,
                OR: [
                    { bot: { orgId: user!.orgId } },
                    { template: { orgId: user!.orgId } },
                ],
            },
            include: {
                steps: { orderBy: { order: "asc" } },
                triggers: true
            }
        });
        if (!flow) {
            set.status = 404;
            return "Flow not found";
        }
        return flow;
    })
    .post("/", async ({ body, set, user }) => {
        try {
            // Verify parent belongs to org
            if (body.templateId) {
                const tmpl = await prisma.template.findFirst({ where: { id: body.templateId, orgId: user!.orgId } });
                if (!tmpl) { set.status = 403; return { error: "Template not found or not in your organization" }; }
            } else if (body.botId) {
                const bot = await prisma.bot.findFirst({ where: { id: body.botId, orgId: user!.orgId } });
                if (!bot) { set.status = 403; return { error: "Bot not found or not in your organization" }; }
            }

            const flow = await prisma.flow.create({
                data: {
                    botId: body.botId || undefined,
                    templateId: body.templateId || undefined,
                    name: body.name,
                    description: body.description,
                    usageLimit: parseInt(body.usageLimit || "0"),
                    cooldownMs: parseInt(body.cooldownMs || "0"),
                    excludesFlows: body.excludesFlows || [],
                    steps: {
                        create: (body.steps || []).map((s: Record<string, unknown>, index: number) => ({
                            type: s.type as StepType,
                            content: s.content as string,
                            mediaUrl: (s.mediaUrl as string) || null,
                            delayMs: (s.delayMs as number) || 1000,
                            jitterPct: (s.jitterPct as number) ?? 10,
                            order: index,
                            aiOnly: (s.aiOnly as boolean) ?? false,
                            metadata: s.metadata ?? undefined
                        }))
                    },
                    triggers: {
                        create: mapTriggers(body.triggers || [], { botId: body.botId, templateId: body.templateId })
                    }
                },
                include: { steps: true, triggers: true }
            });
            syncFlowTool(flow).catch(e => console.warn('[FlowController] syncFlowTool on create failed:', (e as Error).message));
            return flow;
        } catch (e: unknown) {
            set.status = 500;
            return { error: `Failed to create flow: ${e instanceof Error ? e.message : e}` };
        }
    }, {
        body: t.Object({
            botId: t.Optional(t.String()),
            templateId: t.Optional(t.String()),
            name: t.String(),
            description: t.Optional(t.String()),
            usageLimit: t.Optional(t.String()),
            cooldownMs: t.Optional(t.String()),
            excludesFlows: t.Optional(t.Array(t.String())),
            steps: t.Optional(t.Array(t.Any())),
            triggers: t.Optional(t.Array(t.Any())),
        }),
    })
    .put("/:id", async ({ params: { id }, body, set, user }) => {
        try {
            // Verify flow belongs to org
            const existing = await prisma.flow.findFirst({
                where: {
                    id,
                    OR: [
                        { bot: { orgId: user!.orgId } },
                        { template: { orgId: user!.orgId } },
                    ],
                },
            });
            if (!existing) {
                set.status = 404;
                return { error: "Flow not found" };
            }

            // Atomic update: Delete old steps/triggers and create new ones
            const flow = await prisma.$transaction(async (tx) => {
                await tx.step.deleteMany({ where: { flowId: id } });
                await tx.trigger.deleteMany({ where: { flowId: id } });

                return tx.flow.update({
                    where: { id },
                    data: {
                        name: body.name,
                        description: body.description,
                        usageLimit: parseInt(body.usageLimit || "0"),
                        cooldownMs: parseInt(body.cooldownMs || "0"),
                        excludesFlows: body.excludesFlows || [],
                        steps: {
                            create: (body.steps || []).map((s: Record<string, unknown>, index: number) => ({
                                type: s.type as StepType,
                                content: s.content as string,
                                mediaUrl: (s.mediaUrl as string) || null,
                                delayMs: (s.delayMs as number) || 1000,
                                jitterPct: (s.jitterPct as number) ?? 10,
                                order: index,
                                aiOnly: (s.aiOnly as boolean) ?? false,
                                metadata: s.metadata ?? undefined
                            }))
                        },
                        triggers: {
                            create: mapTriggers(body.triggers || [], { botId: body.botId, templateId: body.templateId })
                        }
                    },
                    include: { steps: true, triggers: true }
                });
            });
            syncFlowTool(flow).catch(e => console.warn('[FlowController] syncFlowTool on update failed:', (e as Error).message));
            return flow;
        } catch (e: unknown) {
            set.status = 500;
            return { error: `Failed to update flow: ${e instanceof Error ? e.message : e}` };
        }
    }, {
        body: t.Object({
            botId: t.Optional(t.String()),
            templateId: t.Optional(t.String()),
            name: t.String(),
            description: t.Optional(t.String()),
            usageLimit: t.Optional(t.String()),
            cooldownMs: t.Optional(t.String()),
            excludesFlows: t.Optional(t.Array(t.String())),
            steps: t.Optional(t.Array(t.Any())),
            triggers: t.Optional(t.Array(t.Any())),
        }),
    })
    .delete("/:id", async ({ params: { id }, set, user }) => {
        try {
            // Verify flow belongs to org
            const existing = await prisma.flow.findFirst({
                where: {
                    id,
                    OR: [
                        { bot: { orgId: user!.orgId } },
                        { template: { orgId: user!.orgId } },
                    ],
                },
            });
            if (!existing) {
                set.status = 404;
                return { error: "Flow not found" };
            }

            await prisma.flow.delete({ where: { id } });
            return { success: true };
        } catch (e) {
            set.status = 500;
            return { error: "Failed to delete flow" };
        }
    })
    .get("/export", async ({ query, set, user }) => {
        const { botId, templateId, flowId } = query as {
            botId?: string;
            templateId?: string;
            flowId?: string;
        };

        const where: any = {};
        if (flowId) {
            where.id = flowId;
            where.OR = [
                { bot: { orgId: user!.orgId } },
                { template: { orgId: user!.orgId } },
            ];
        } else if (templateId) {
            where.templateId = templateId;
            where.template = { orgId: user!.orgId };
        } else if (botId) {
            where.botId = botId;
            where.bot = { orgId: user!.orgId };
        } else {
            set.status = 400;
            return { error: "Provide botId, templateId, or flowId" };
        }

        const flows = await prisma.flow.findMany({
            where,
            include: {
                steps: { orderBy: { order: "asc" } },
                triggers: true,
            },
        });

        if (flows.length === 0) {
            set.status = 404;
            return { error: "No flows found" };
        }

        // Build ID->name map for excludesFlows resolution
        const idToName = new Map(flows.map(f => [f.id, f.name]));

        const exported = flows.map(f => ({
            name: f.name,
            description: f.description,
            cooldownMs: f.cooldownMs,
            usageLimit: f.usageLimit,
            excludesFlows: (f.excludesFlows || [])
                .map(id => idToName.get(id))
                .filter(Boolean),
            steps: f.steps.map(s => ({
                type: s.type,
                content: s.content,
                mediaUrl: s.mediaUrl,
                metadata: s.metadata,
                delayMs: s.delayMs,
                jitterPct: s.jitterPct,
                order: s.order,
                aiOnly: s.aiOnly,
            })),
            triggers: f.triggers.map(tr => ({
                keyword: tr.keyword,
                matchType: tr.matchType,
                scope: tr.scope,
                triggerType: tr.triggerType,
                labelName: tr.labelName,
                labelAction: tr.labelAction,
            })),
        }));

        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            flows: exported,
        };
    })
    .post("/import-json", async ({ body, set, user }) => {
        const { botId, templateId, flows } = body;

        if (!Array.isArray(flows) || flows.length === 0) {
            set.status = 400;
            return { error: "Body must include a non-empty flows array" };
        }
        if (!botId && !templateId) {
            set.status = 400;
            return { error: "Provide botId or templateId as target" };
        }

        try {
            // Verify parent belongs to org
            if (templateId) {
                const tmpl = await prisma.template.findFirst({ where: { id: templateId, orgId: user!.orgId } });
                if (!tmpl) { set.status = 403; return { error: "Template not found or not in your organization" }; }
            } else if (botId) {
                const bot = await prisma.bot.findFirst({ where: { id: botId, orgId: user!.orgId } });
                if (!bot) { set.status = 403; return { error: "Bot not found or not in your organization" }; }
            }

            const owner = templateId ? { templateId } : { botId };
            const triggerOwner = templateId ? { templateId } : { botId };

            // First pass: create all flows to get new IDs
            const nameToId = new Map<string, string>();
            const created = [];

            for (const f of flows) {
                const flow = await prisma.flow.create({
                    data: {
                        ...owner,
                        name: f.name,
                        description: f.description || null,
                        usageLimit: parseInt(f.usageLimit || 0),
                        cooldownMs: parseInt(f.cooldownMs || 0),
                        excludesFlows: [], // resolved in second pass
                        steps: {
                            create: (f.steps || []).map((s: Record<string, unknown>, index: number) => ({
                                type: s.type as StepType,
                                content: s.content,
                                mediaUrl: (s.mediaUrl as string) || null,
                                delayMs: (s.delayMs as number) || 1000,
                                jitterPct: (s.jitterPct as number) ?? 10,
                                order: (s.order as number) ?? index,
                                aiOnly: (s.aiOnly as boolean) ?? false,
                                metadata: s.metadata ?? undefined,
                            })),
                        },
                        triggers: {
                            create: (f.triggers || []).map((tr: Record<string, unknown>) => ({
                                keyword: (tr.keyword as string) || (tr.labelName as string) || "",
                                matchType: (tr.matchType as string) || "CONTAINS",
                                scope: (tr.scope as string) || "INCOMING",
                                triggerType: (tr.triggerType as string) || "TEXT",
                                labelName: (tr.labelName as string) || null,
                                labelAction: (tr.labelAction as string) || null,
                                ...triggerOwner,
                            })),
                        },
                    },
                    include: { steps: true, triggers: true },
                });
                nameToId.set(f.name, flow.id);
                created.push({ flow, originalExcludes: f.excludesFlows || [] });
            }

            // Second pass: resolve excludesFlows by name -> new ID
            for (const { flow, originalExcludes } of created) {
                if (originalExcludes.length > 0) {
                    const resolvedIds = originalExcludes
                        .map((name: string) => nameToId.get(name))
                        .filter(Boolean) as string[];
                    if (resolvedIds.length > 0) {
                        await prisma.flow.update({
                            where: { id: flow.id },
                            data: { excludesFlows: resolvedIds },
                        });
                    }
                }
                syncFlowTool(flow).catch(e =>
                    console.warn("[FlowController] syncFlowTool on import-json failed:", (e as Error).message)
                );
            }

            return {
                success: true,
                imported: created.length,
                flows: created.map(c => ({ id: c.flow.id, name: c.flow.name })),
            };
        } catch (e: unknown) {
            set.status = 500;
            return { error: `Import failed: ${e instanceof Error ? e.message : e}` };
        }
    }, {
        body: t.Object({
            botId: t.Optional(t.String()),
            templateId: t.Optional(t.String()),
            flows: t.Array(t.Any()),
        }),
    })
    .post("/import", async ({ body, set, user }) => {
        const { sourceFlowId, targetBotId } = body as { sourceFlowId: string, targetBotId: string };

        if (!sourceFlowId || !targetBotId) {
            set.status = 400;
            return { error: "Missing sourceFlowId or targetBotId" };
        }

        try {
            // Verify source flow belongs to org
            const sourceFlow = await prisma.flow.findFirst({
                where: {
                    id: sourceFlowId,
                    OR: [
                        { bot: { orgId: user!.orgId } },
                        { template: { orgId: user!.orgId } },
                    ],
                },
                include: { steps: true, triggers: true }
            });

            if (!sourceFlow) {
                set.status = 404;
                return { error: "Source flow not found" };
            }

            // Verify target bot belongs to org
            const targetBot = await prisma.bot.findFirst({ where: { id: targetBotId, orgId: user!.orgId } });
            if (!targetBot) {
                set.status = 403;
                return { error: "Target bot not found or not in your organization" };
            }

            const newFlow = await prisma.flow.create({
                data: {
                    botId: targetBotId,
                    name: `${sourceFlow.name} (Copy)`,
                    description: sourceFlow.description,
                    usageLimit: sourceFlow.usageLimit,
                    cooldownMs: sourceFlow.cooldownMs,
                    excludesFlows: sourceFlow.excludesFlows || [],
                    steps: {
                        create: sourceFlow.steps.map(s => ({
                            type: s.type,
                            content: s.content,
                            mediaUrl: s.mediaUrl,
                            delayMs: s.delayMs,
                            jitterPct: s.jitterPct,
                            order: s.order,
                            aiOnly: s.aiOnly,
                            metadata: s.metadata ?? undefined
                        }))
                    },
                    triggers: {
                        create: sourceFlow.triggers.map(t => ({
                            keyword: t.keyword,
                            matchType: t.matchType,
                            scope: t.scope,
                            triggerType: t.triggerType,
                            labelName: t.labelName,
                            labelAction: t.labelAction,
                            botId: targetBotId
                        }))
                    }
                },
                include: { steps: true, triggers: true }
            });

            syncFlowTool(newFlow).catch(e => console.warn('[FlowController] syncFlowTool on import failed:', (e as Error).message));
            return newFlow;
        } catch (e: unknown) {
            set.status = 500;
            return { error: `Import failed: ${e instanceof Error ? e.message : e}` };
        }
    });
