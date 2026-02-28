import type { Message } from "@prisma/client";
import { redis } from "./redis.service";
import { prisma } from "./postgres.service";

const REDIS_PREFIX = "acc:";
const REDIS_TTL = 300; // 5 min safety TTL (well above any realistic messageDelay)

// In-memory timers only — message IDs are persisted in Redis
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export class MessageAccumulator {

    /**
     * Add a message to the accumulation buffer for a session.
     * Message IDs are stored in Redis (crash-safe); only the debounce timer is in-memory.
     * When the timer expires, messages are re-read from DB and passed to the callback.
     */
    static async accumulate(
        sessionId: string,
        message: Message,
        delaySec: number,
        callback: (sessionId: string, messages: Message[]) => void
    ): Promise<void> {
        const key = `${REDIS_PREFIX}${sessionId}`;

        // Push message ID to Redis list and refresh TTL
        await redis.rpush(key, message.id);
        await redis.expire(key, REDIS_TTL);

        // Reset the in-memory debounce timer
        const existing = timers.get(sessionId);
        if (existing) clearTimeout(existing);

        timers.set(sessionId, setTimeout(() => {
            timers.delete(sessionId);
            MessageAccumulator.flush(sessionId, callback).catch(e => {
                console.error(`[Accumulator] Flush error for session ${sessionId}:`, e);
            });
        }, delaySec * 1000));
    }

    /**
     * Flush a single session's buffer: read IDs from Redis, fetch from DB, invoke callback.
     */
    private static async flush(
        sessionId: string,
        callback: (sessionId: string, messages: Message[]) => void
    ): Promise<void> {
        const key = `${REDIS_PREFIX}${sessionId}`;

        // Atomically read + delete
        const messageIds = await redis.lrange(key, 0, -1);
        await redis.del(key);

        if (messageIds.length === 0) return;

        const messages = await prisma.message.findMany({
            where: { id: { in: messageIds } },
            orderBy: { createdAt: "asc" },
        });

        console.log(`[Accumulator] Flushing ${messages.length} message(s) for session ${sessionId}`);

        try {
            callback(sessionId, messages);
        } catch (e) {
            console.error(`[Accumulator] Callback error for session ${sessionId}:`, e);
        }
    }

    /**
     * Force-flush all pending buffers (for graceful shutdown).
     */
    static async flushAll(callback: (sessionId: string, messages: Message[]) => void): Promise<void> {
        // Flush sessions with active timers
        for (const [sessionId, timer] of timers) {
            clearTimeout(timer);
            timers.delete(sessionId);
            await MessageAccumulator.flush(sessionId, callback);
        }

        // Also recover any orphaned Redis keys (from a previous crash)
        const keys = await redis.keys(`${REDIS_PREFIX}*`);
        for (const key of keys) {
            const sessionId = key.slice(REDIS_PREFIX.length);
            await MessageAccumulator.flush(sessionId, callback);
        }
    }

    static get pendingCount(): number {
        return timers.size;
    }
}
