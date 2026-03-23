import { prisma } from "../../services/postgres.service";
import { redis } from "../../services/redis.service";
import { queueService } from "../../services/queue.service";
import { BotConfigService } from "../../services/bot-config.service";

export class AutomationProcessor {
    static async processAll(): Promise<void> {
        const automations = await prisma.automation.findMany({
            where: { enabled: true },
            include: { bot: { include: { template: true } } },
        });

        const active = automations.filter(a => a.bot && !a.bot.paused && a.bot.aiEnabled);
        console.log(`[Automation] Processing ${active.length} active automation(s) (${automations.length} total)`);

        const results = await Promise.allSettled(
            active.map(automation =>
                automation.labelName
                    ? this.processWithLabel(automation)
                    : this.processWithoutLabel(automation)
            )
        );

        for (let i = 0; i < results.length; i++) {
            if (results[i].status === "rejected") {
                console.error(`[Automation] Error in "${active[i].name}":`, (results[i] as PromiseRejectedResult).reason);
            }
        }
    }

    /** Sessions that HAVE the specified label and are inactive */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- complex Prisma include result
    private static async processWithLabel(automation: any): Promise<void> {
        const ignoredLabels: string[] = await BotConfigService.resolveIgnoredLabels(automation.bot);

        const sessionLabels = await prisma.sessionLabel.findMany({
            where: {
                label: {
                    botId: automation.botId,
                    name: automation.labelName,
                    deleted: false,
                },
                ...(ignoredLabels.length > 0 && {
                    session: {
                        labels: {
                            none: { labelId: { in: ignoredLabels } },
                        },
                    },
                }),
            },
            include: {
                session: {
                    include: {
                        messages: {
                            where: { fromMe: false },
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: { createdAt: true },
                        },
                    },
                },
            },
        });

        const cutoff = Date.now() - automation.timeoutMs;

        await Promise.allSettled(
            sessionLabels.map(sl => this.triggerIfInactive(automation, sl.session, cutoff))
        );
    }

    /** Sessions that have NO labels at all and are inactive */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- complex Prisma include result
    private static async processWithoutLabel(automation: any): Promise<void> {
        const sessions = await prisma.session.findMany({
            where: {
                botId: automation.botId,
                labels: { none: {} },
            },
            include: {
                messages: {
                    where: { fromMe: false },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { createdAt: true },
                },
            },
        });

        const cutoff = Date.now() - automation.timeoutMs;

        await Promise.allSettled(
            sessions.map(session => this.triggerIfInactive(automation, session, cutoff))
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- complex Prisma include result
    private static async triggerIfInactive(automation: any, session: any, cutoff: number): Promise<void> {
        // Skip the bot's own session
        if (session.identifier === automation.bot.identifier) return;

        const lastUserMsg = session.messages[0]?.createdAt;
        if (!lastUserMsg || lastUserMsg.getTime() > cutoff) return;

        const redisKey = `automation:done:${automation.id}:${session.id}`;
        const already = await redis.get(redisKey);
        if (already) return;

        await redis.set(redisKey, "1", "PX", automation.timeoutMs);

        try {
            console.log(`[Automation] Triggering "${automation.name}" for session ${session.id}`);

            // Persist synthetic message to DB so the worker can fetch it by ID
            const msg = await prisma.message.create({
                data: {
                    sessionId: session.id,
                    content: `[Automatización: ${automation.name}] ${automation.prompt}`,
                    type: "TEXT",
                    fromMe: false,
                    externalId: `auto_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    sender: "system",
                },
            });

            await queueService.enqueueAIProcessing(session.id, [msg.id]);
        } catch (err) {
            console.error(`[Automation] Error processing session ${session.id}:`, err);
        }
    }
}
