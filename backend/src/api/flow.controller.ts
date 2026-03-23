import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { StepType } from "@prisma/client";
import { syncFlowTool } from "../services/flow-tool-sync";
import { authMiddleware } from "../middleware/auth.middleware";

export const flowController = new Elysia({ prefix: "/flows" })
    .use(authMiddleware)
    .guard({ isSignIn: true })
    .get("/", async ({ query }) => {
        const { botId, templateId } = query as { botId?: string; templateId?: string };

        const where: { botId?: string; templateId?: string } = {};
        if (templateId) where.templateId = templateId;
        else if (botId) where.botId = botId;

        const flows = await prisma.flow.findMany({
            where: Object.keys(where).length > 0 ? where : undefined,
            include: {
                steps: {
                    orderBy: { order: "asc" }
                },
                triggers: true
            }
        });
        return flows;
    })
    .get("/:id", async ({ params: { id }, set }) => {
        const flow = await prisma.flow.findUnique({
            where: { id },
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
    .post("/", async ({ body, set }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia untyped body with nested arrays
        const b = body as any;
        const { botId, templateId, name, description, steps, triggers } = b;

        try {
            const owner = templateId
                ? { templateId }
                : { botId };
            const triggerOwner = templateId
                ? { templateId }
                : { botId };

            const flow = await prisma.flow.create({
                data: {
                    ...owner,
                    name,
                    description,
                    usageLimit: parseInt(b.usageLimit || 0),
                    cooldownMs: parseInt(b.cooldownMs || 0),
                    excludesFlows: b.excludesFlows || [],
                    steps: {
                        create: (steps || []).map((s: any, index: number) => ({
                            type: (s.type as StepType),
                            content: s.content,
                            mediaUrl: s.mediaUrl,
                            delayMs: s.delayMs || 1000,
                            jitterPct: s.jitterPct ?? 10,
                            order: index,
                            aiOnly: s.aiOnly ?? false,
                            metadata: s.metadata ?? undefined
                        }))
                    },
                    triggers: {
                        create: (triggers || []).map((t: any) => ({
                            keyword: t.keyword || t.labelName || '',
                            matchType: t.matchType || 'CONTAINS',
                            scope: t.scope || 'INCOMING',
                            triggerType: t.triggerType || 'TEXT',
                            labelName: t.labelName || null,
                            labelAction: t.labelAction || null,
                            ...triggerOwner
                        }))
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
    })
    .put("/:id", async ({ params: { id }, body, set }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia untyped body with nested arrays
        const b = body as any;
        const { botId, templateId, name, description, steps, triggers } = b;

        try {
            const triggerOwner = templateId
                ? { templateId }
                : botId ? { botId } : {};

            // Atomic update: Delete old steps/triggers and create new ones
            const flow = await prisma.$transaction(async (tx) => {
                await tx.step.deleteMany({ where: { flowId: id } });
                await tx.trigger.deleteMany({ where: { flowId: id } });

                return tx.flow.update({
                    where: { id },
                    data: {
                        name,
                        description,
                        usageLimit: parseInt(b.usageLimit || 0),
                        cooldownMs: parseInt(b.cooldownMs || 0),
                        excludesFlows: b.excludesFlows || [],
                        steps: {
                            create: (steps || []).map((s: any, index: number) => ({
                                type: (s.type as StepType),
                                content: s.content,
                                mediaUrl: s.mediaUrl,
                                delayMs: s.delayMs || 1000,
                                jitterPct: s.jitterPct ?? 10,
                                order: index,
                                aiOnly: s.aiOnly ?? false,
                                metadata: s.metadata ?? undefined
                            }))
                        },
                        triggers: {
                            create: (triggers || []).map((t: any) => ({
                                keyword: t.keyword || t.labelName || '',
                                matchType: t.matchType || 'CONTAINS',
                                scope: t.scope || 'INCOMING',
                                triggerType: t.triggerType || 'TEXT',
                                labelName: t.labelName || null,
                                labelAction: t.labelAction || null,
                                ...triggerOwner
                            }))
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
    })
    .delete("/:id", async ({ params: { id }, set }) => {
        try {
            await prisma.flow.delete({ where: { id } });
            return { success: true };
        } catch (e) {
            set.status = 500;
            return { error: "Failed to delete flow" };
        }
    })
    .get("/export", async ({ query, set }) => {
        const { botId, templateId, flowId } = query as {
            botId?: string;
            templateId?: string;
            flowId?: string;
        };

        const where: any = {};
        if (flowId) {
            where.id = flowId;
        } else if (templateId) {
            where.templateId = templateId;
        } else if (botId) {
            where.botId = botId;
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

        // Build ID→name map for excludesFlows resolution
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
    .post("/import-json", async ({ body, set }) => {
        const b = body as any;
        const { botId, templateId, flows } = b;

        if (!Array.isArray(flows) || flows.length === 0) {
            set.status = 400;
            return { error: "Body must include a non-empty flows array" };
        }
        if (!botId && !templateId) {
            set.status = 400;
            return { error: "Provide botId or templateId as target" };
        }

        try {
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
                            create: (f.steps || []).map((s: any, index: number) => ({
                                type: s.type as StepType,
                                content: s.content,
                                mediaUrl: s.mediaUrl || null,
                                delayMs: s.delayMs || 1000,
                                jitterPct: s.jitterPct ?? 10,
                                order: s.order ?? index,
                                aiOnly: s.aiOnly ?? false,
                                metadata: s.metadata ?? undefined,
                            })),
                        },
                        triggers: {
                            create: (f.triggers || []).map((tr: any) => ({
                                keyword: tr.keyword || tr.labelName || "",
                                matchType: tr.matchType || "CONTAINS",
                                scope: tr.scope || "INCOMING",
                                triggerType: tr.triggerType || "TEXT",
                                labelName: tr.labelName || null,
                                labelAction: tr.labelAction || null,
                                ...triggerOwner,
                            })),
                        },
                    },
                    include: { steps: true, triggers: true },
                });
                nameToId.set(f.name, flow.id);
                created.push({ flow, originalExcludes: f.excludesFlows || [] });
            }

            // Second pass: resolve excludesFlows by name → new ID
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
    })
    .post("/import", async ({ body, set }) => {
        const { sourceFlowId, targetBotId } = body as { sourceFlowId: string, targetBotId: string };

        if (!sourceFlowId || !targetBotId) {
            set.status = 400;
            return { error: "Missing sourceFlowId or targetBotId" };
        }

        try {
            const sourceFlow = await prisma.flow.findUnique({
                where: { id: sourceFlowId },
                include: { steps: true, triggers: true }
            });

            if (!sourceFlow) {
                set.status = 404;
                return { error: "Source flow not found" };
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

