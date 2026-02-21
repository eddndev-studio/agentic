import { prisma } from "../../services/postgres.service";
import { redis } from "../../services/redis.service";
import { aiEngine } from "../../core/ai";
import type { Message } from "@prisma/client";

export class AutomationProcessor {
    static async processAll(): Promise<void> {
        const automations = await prisma.automation.findMany({
            where: { enabled: true },
            include: { bot: true },
        });

        console.log(`[Automation] Processing ${automations.length} active automation(s)`);

        for (const automation of automations) {
            if (!automation.bot.aiEnabled) continue;

            try {
                await this.processAutomation(automation);
            } catch (err) {
                console.error(`[Automation] Error processing automation "${automation.name}":`, err);
            }
        }
    }

    private static async processAutomation(automation: any): Promise<void> {
        // 1. Find sessions with the required label
        const sessionLabels = await prisma.sessionLabel.findMany({
            where: {
                label: {
                    botId: automation.botId,
                    name: automation.labelName,
                    deleted: false,
                },
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

        // 2. Filter by inactivity
        const cutoff = Date.now() - automation.timeoutMs;

        for (const sl of sessionLabels) {
            const lastUserMsg = sl.session.messages[0]?.createdAt;
            if (!lastUserMsg || lastUserMsg.getTime() > cutoff) continue; // still active, skip

            // 3. Anti-duplicate via Redis (TTL = timeoutMs)
            const redisKey = `automation:done:${automation.id}:${sl.session.id}`;
            const already = await redis.get(redisKey);
            if (already) continue;

            // 4. Mark as processed
            await redis.set(redisKey, "1", "PX", automation.timeoutMs);

            // 5. Invoke AI with synthetic message
            const syntheticMessage = {
                id: `auto_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                content: `[Automatización: ${automation.name}] ${automation.prompt}`,
                type: "TEXT",
                fromMe: false,
                externalId: null,
                metadata: null,
            } as unknown as Message;

            try {
                console.log(`[Automation] Triggering "${automation.name}" for session ${sl.session.id}`);
                await aiEngine.processMessages(sl.session.id, [syntheticMessage]);
            } catch (err) {
                console.error(`[Automation] Error processing session ${sl.session.id}:`, err);
            }
        }
    }
}
