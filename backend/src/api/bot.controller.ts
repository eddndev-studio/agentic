import { Elysia, t } from "elysia";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { prisma } from "../services/postgres.service";
import { Platform, AIProvider } from "@prisma/client";
import { providerRegistry } from "../providers/registry";
import { ConversationService } from "../services/conversation.service";
import { authMiddleware } from "../middleware/auth.middleware";

// Configuration
const IPV6_SUBNET_PREFIX = "2605:a140:2302:3245";

/**
 * Generates a random IPv6 address within the configured /64 subnet.
 * Format: PREFIX:XXXX:XXXX:XXXX:XXXX
 */
function generateRandomIPv6(): string {
    const segment = () => Math.floor(Math.random() * 0xffff).toString(16);
    return `${IPV6_SUBNET_PREFIX}:${segment()}:${segment()}:${segment()}:${segment()}`;
}

/**
 * Binds an IPv6 address to the network interface so Baileys can use it.
 */
async function bindIPv6(address: string): Promise<void> {
    try {
        execSync(`ip -6 addr add ${address}/64 dev eth0 2>/dev/null || true`);
        console.log(`[IPv6] Bound ${address} to eth0`);
    } catch (e: unknown) {
        console.error(`[IPv6] Failed to bind ${address}:`, (e instanceof Error ? e.message : e));
    }
}

/**
 * For WORKER role, verifies the bot is assigned via WorkerBot.
 * Returns the bot if access is granted, null otherwise.
 */
async function findBotWithAccess(id: string, user: { id: string; orgId: string; role: string }) {
    const bot = await prisma.bot.findFirst({ where: { id, orgId: user.orgId } });
    if (!bot) return null;

    if (user.role === "WORKER") {
        const assignment = await prisma.workerBot.findFirst({
            where: {
                botId: id,
                membership: { userId: user.id, orgId: user.orgId }
            }
        });
        if (!assignment) return null;
    }

    return bot;
}

export const botController = new Elysia({ prefix: "/bots" })
    .use(authMiddleware)
    .guard({ isSignIn: true })
    // List all bots (WORKER sees only assigned bots)
    .get("/", async ({ user }) => {
        const where: any = { orgId: user!.orgId };

        if (user!.role === "WORKER") {
            const membership = await prisma.membership.findUnique({
                where: { userId_orgId: { userId: user!.id, orgId: user!.orgId } },
                include: { workerBots: { select: { botId: true } } }
            });
            const assignedIds = membership?.workerBots.map(wb => wb.botId) ?? [];
            where.id = { in: assignedIds };
        }

        return prisma.bot.findMany({
            where,
            orderBy: { name: 'asc' },
            include: { template: { select: { id: true, name: true } } },
        });
    })
    // Create bot
    .post("/", async ({ body, set, user }) => {
        try {
            // Auto-assign IPv6
            const assignedIPv6 = generateRandomIPv6();

            const bot = await prisma.bot.create({
                data: {
                    name: body.name,
                    platform: (body.platform as Platform) || Platform.WHATSAPP,
                    identifier: body.identifier,
                    ipv6Address: assignedIPv6,
                    credentials: {},
                    orgId: user!.orgId,
                }
            });
            await bindIPv6(assignedIPv6);
            return bot;
        } catch (e: unknown) {
            if (e instanceof Error && 'code' in e && (e as Record<string, unknown>).code === 'P2002') {
                set.status = 409;
                return "Bot Identifier already exists";
            }
            throw e;
        }
    }, {
        body: t.Object({
            name: t.String(),
            identifier: t.String(),
            platform: t.Optional(t.String()),
            // ipv6Address removed from input validation as it is auto-generated
        })
    })
    // Connection Management (provider-agnostic)
    .post("/:id/connect", async ({ params: { id }, set, user }) => {
        try {
            const bot = await findBotWithAccess(id, user!);
            if (!bot) { set.status = 404; return { error: "Bot not found" }; }

            const provider = await providerRegistry.forBot(id);
            await provider.startSession(id);
            return { success: true, message: "Session initialization started" };
        } catch (e: unknown) {
            set.status = 500;
            return `Failed to start session: ${e instanceof Error ? e.message : e}`;
        }
    })
    .get("/:id/qr", async ({ params: { id }, set, user }) => {
        const bot = await findBotWithAccess(id, user!);
        if (!bot) { set.status = 404; return { error: "Bot not found" }; }

        const provider = await providerRegistry.forBot(id);
        const qr = provider.getQR(id);
        if (!qr) {
            set.status = 404;
            return { message: "QR not generated or session already connected" };
        }
        return { qr };
    })
    .get("/:id/status", async ({ params: { id }, set, user }) => {
        const bot = await findBotWithAccess(id, user!);
        if (!bot) { set.status = 404; return { error: "Bot not found" }; }

        const provider = await providerRegistry.forBot(id);
        return provider.getStatus(id);
    })
    .post("/:id/disconnect", async ({ params: { id }, set, user }) => {
        try {
            const bot = await findBotWithAccess(id, user!);
            if (!bot) { set.status = 404; return { error: "Bot not found" }; }

            const provider = await providerRegistry.forBot(id);
            await provider.stopSession(id);
            return { success: true, message: "Session disconnected successfully" };
        } catch (e: unknown) {
            set.status = 500;
            return `Failed to disconnect session: ${e instanceof Error ? e.message : e}`;
        }
    })
    // Generate a public connect link
    .post("/:id/generate-link", async ({ params: { id }, set, user }) => {
        const bot = await findBotWithAccess(id, user!);
        if (!bot) { set.status = 404; return { error: "Bot not found" }; }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

        await prisma.connectToken.create({
            data: { token, botId: id, expiresAt },
        });

        return { token, expiresAt: expiresAt.toISOString(), link: `/connect?token=${token}` };
    })
    // Generic /:id routes
    .get("/:id", async ({ params: { id }, set, user }) => {
        const hasAccess = await findBotWithAccess(id, user!);
        if (!hasAccess) { set.status = 404; return { error: "Bot not found" }; }

        const bot = await prisma.bot.findFirst({
            where: { id, orgId: user!.orgId },
            include: { template: { select: { id: true, name: true } } },
        });
        return bot;
    })
    .put("/:id", async ({ params: { id }, body, set, user }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia untyped body (many optional fields)
        const b = body as any;

        try {
            // Verify bot belongs to this org and user has access
            const existingBot = await findBotWithAccess(id, user!);
            if (!existingBot) { set.status = 404; return { error: "Bot not found" }; }

            // Check if system prompt or provider/model changed — if so, clear conversations
            let shouldClearConversations = false;
            if (b.systemPrompt !== undefined || b.aiProvider !== undefined || b.aiModel !== undefined) {
                if (existingBot) {
                    shouldClearConversations =
                        (b.systemPrompt !== undefined && b.systemPrompt !== existingBot.systemPrompt) ||
                        (b.aiProvider !== undefined && b.aiProvider !== existingBot.aiProvider) ||
                        (b.aiModel !== undefined && b.aiModel !== existingBot.aiModel);
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma partial update
            const data: any = {};
            if (b.name !== undefined) data.name = b.name;
            if (b.identifier !== undefined) data.identifier = b.identifier;
            if (b.platform !== undefined) data.platform = b.platform as Platform;
            if (b.credentials !== undefined) data.credentials = b.credentials;
            if (b.ipv6Address !== undefined) data.ipv6Address = b.ipv6Address;
            if (b.aiEnabled !== undefined) data.aiEnabled = b.aiEnabled;
            if (b.defaultSessionAi !== undefined) data.defaultSessionAi = b.defaultSessionAi;
            if (b.aiProvider !== undefined) data.aiProvider = b.aiProvider as AIProvider;
            if (b.aiModel !== undefined) data.aiModel = b.aiModel;
            if (b.systemPrompt !== undefined) data.systemPrompt = b.systemPrompt;
            if (b.temperature !== undefined) data.temperature = b.temperature;
            if (b.messageDelay !== undefined) data.messageDelay = b.messageDelay;
            if (b.contextMessages !== undefined) data.contextMessages = b.contextMessages;
            if (b.autoReadReceipts !== undefined) data.autoReadReceipts = b.autoReadReceipts;
            if (b.excludeGroups !== undefined) data.excludeGroups = b.excludeGroups;
            if (b.ignoredLabels !== undefined) data.ignoredLabels = b.ignoredLabels;
            if (b.paused !== undefined) data.paused = b.paused;
            if (b.thinkingLevel !== undefined) data.thinkingLevel = b.thinkingLevel;
            if (b.notificationChannels !== undefined) data.notificationChannels = b.notificationChannels;
            if (b.templateId !== undefined) data.templateId = b.templateId || null;
            if (b.botVariables !== undefined) data.botVariables = b.botVariables;

            const bot = await prisma.bot.update({ where: { id }, data });

            // Invalidate notification cache on config change
            if (b.notificationChannels !== undefined) {
                const { notificationService } = await import("../services/notification.service");
                notificationService.invalidateCache(id);
            }

            // Auto-clear conversation histories when AI config changes
            if (shouldClearConversations) {
                const sessions = await prisma.session.findMany({
                    where: { botId: id },
                    select: { id: true },
                });
                for (const session of sessions) {
                    await ConversationService.clear(session.id);
                }
                console.log(`[Bot] Cleared ${sessions.length} conversation(s) for bot ${id} due to AI config change`);
            }

            return bot;
        } catch (_e: unknown) {
            set.status = 500;
            return "Failed to update bot";
        }
    })
    // Clear all conversation histories for a bot
    .post("/:id/clear-conversations", async ({ params: { id }, set, user }) => {
        try {
            const bot = await findBotWithAccess(id, user!);
            if (!bot) { set.status = 404; return { error: "Bot not found" }; }

            const sessions = await prisma.session.findMany({
                where: { botId: id },
                select: { id: true },
            });

            for (const session of sessions) {
                await ConversationService.clear(session.id);
            }

            return { success: true, cleared: sessions.length };
        } catch (_e: unknown) {
            set.status = 500;
            return { error: "Failed to clear conversations" };
        }
    })
    // Clone bot with all flows, tools, and automations
    .post("/:id/clone", async ({ params: { id }, body, set, user }) => {
        const { name, identifier } = body as { name: string; identifier: string };

        if (!name || !identifier) {
            set.status = 400;
            return { error: "Name and identifier are required" };
        }

        const hasAccess = await findBotWithAccess(id, user!);
        if (!hasAccess) { set.status = 404; return { error: "Bot not found" }; }

        const source = await prisma.bot.findFirst({
            where: { id, orgId: user!.orgId },
            include: {
                flows: { include: { steps: true, triggers: true } },
                tools: true,
                automations: true,
            },
        });
        if (!source) { set.status = 404; return { error: "Bot not found" }; }

        try {
            const result = await prisma.$transaction(async (tx) => {
                // 1. Create new bot with copied settings
                const newBot = await tx.bot.create({
                    data: {
                        name,
                        identifier,
                        platform: source.platform,
                        ipv6Address: generateRandomIPv6(), // bound to eth0 after transaction
                        credentials: {},
                        aiEnabled: source.aiEnabled,
                        aiProvider: source.aiProvider,
                        aiModel: source.aiModel,
                        systemPrompt: source.systemPrompt,
                        temperature: source.temperature,
                        messageDelay: source.messageDelay,
                        excludeGroups: source.excludeGroups,
                        ignoredLabels: source.ignoredLabels,
                        notificationChannels: source.notificationChannels || [],
                        orgId: user!.orgId,
                    },
                });

                // 2. Clone flows and build oldId -> newId mapping
                const flowIdMap = new Map<string, string>();
                for (const flow of source.flows) {
                    const newFlow = await tx.flow.create({
                        data: {
                            name: flow.name,
                            description: flow.description,
                            botId: newBot.id,
                            cooldownMs: flow.cooldownMs,
                            usageLimit: flow.usageLimit,
                            excludesFlows: [], // Will be updated after all flows are created
                            steps: {
                                create: flow.steps.map((s) => ({
                                    type: s.type,
                                    content: s.content,
                                    mediaUrl: s.mediaUrl,
                                    metadata: s.metadata ?? undefined,
                                    delayMs: s.delayMs,
                                    jitterPct: s.jitterPct,
                                    order: s.order,
                                })),
                            },
                            triggers: {
                                create: flow.triggers.map((t) => ({
                                    botId: newBot.id,
                                    keyword: t.keyword,
                                    matchType: t.matchType,
                                    scope: t.scope,
                                    isActive: t.isActive,
                                })),
                            },
                        },
                    });
                    flowIdMap.set(flow.id, newFlow.id);
                }

                // 2.5. Update excludesFlows mapping
                for (const flow of source.flows) {
                    if (flow.excludesFlows && flow.excludesFlows.length > 0) {
                        const newFlowId = flowIdMap.get(flow.id);
                        if (newFlowId) {
                            const remappedExcludes = flow.excludesFlows
                                .map((oldId) => flowIdMap.get(oldId))
                                .filter(Boolean) as string[];

                            await tx.flow.update({
                                where: { id: newFlowId },
                                data: { excludesFlows: remappedExcludes },
                            });
                        }
                    }
                }

                // 3. Clone tools, remapping flowId references
                for (const tool of source.tools) {
                    await tx.tool.create({
                        data: {
                            name: tool.name,
                            description: tool.description,
                            actionType: tool.actionType,
                            actionConfig: tool.actionConfig ?? {},
                            parameters: tool.parameters ?? {},
                            status: tool.status,
                            flowId: tool.flowId ? flowIdMap.get(tool.flowId) || null : null,
                            botId: newBot.id,
                        },
                    });
                }

                // 4. Clone automations
                for (const auto of source.automations) {
                    await tx.automation.create({
                        data: {
                            name: auto.name,
                            description: auto.description,
                            event: auto.event,
                            labelName: auto.labelName,
                            timeoutMs: auto.timeoutMs,
                            prompt: auto.prompt,
                            enabled: auto.enabled,
                            botId: newBot.id,
                        },
                    });
                }

                return newBot;
            });

            if (result.ipv6Address) await bindIPv6(result.ipv6Address);
            return result;
        } catch (e: unknown) {
            if (e instanceof Error && 'code' in e && (e as Record<string, unknown>).code === "P2002") {
                set.status = 409;
                return { error: "Bot identifier already exists" };
            }
            console.error("[POST /bots/:id/clone] Error:", e);
            set.status = 500;
            return { error: "Failed to clone bot" };
        }
    }, {
        body: t.Object({
            name: t.String(),
            identifier: t.String(),
        }),
    })
    .delete("/:id", async ({ params: { id }, set, user }) => {
        try {
            const bot = await findBotWithAccess(id, user!);
            if (!bot) { set.status = 404; return { error: "Bot not found" }; }

            await prisma.bot.delete({
                where: { id }
            });
            return { success: true };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[DELETE /bots/:id] Error:", msg);
            console.error("[DELETE /bots/:id] Full error:", JSON.stringify(e, null, 2));
            set.status = 500;
            return { error: "Failed to delete bot", details: msg };
        }
    });
