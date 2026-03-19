import type { Message } from "@prisma/client";
import { redis } from "./redis.service";
import { prisma } from "./postgres.service";

const REDIS_PREFIX = "acc:";
const REDIS_TTL = 300; // 5 min safety TTL (well above any realistic messageDelay)

// Maximum accumulation window: delaySec * this multiplier
// Prevents infinite debounce when messages arrive in continuous bursts
const MAX_ACCUMULATE_MULTIPLIER = 3;

// In-memory timers only — message IDs are persisted in Redis
const timers = new Map<string, ReturnType<typeof setTimeout>>();
// Track when the first message in each batch arrived
const batchStartTimes = new Map<string, number>();

export class MessageAccumulator {

    /**
     * Add a message to the accumulation buffer for a session.
     * Message IDs are stored in Redis (crash-safe); only the debounce timer is in-memory.
     * When the timer expires, messages are re-read from DB and passed to the callback.
     *
     * A maximum accumulation window (delaySec * MAX_ACCUMULATE_MULTIPLIER) prevents
     * infinite debounce when messages keep arriving in rapid succession.
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

        // Track when the first message in this batch arrived
        if (!batchStartTimes.has(sessionId)) {
            batchStartTimes.set(sessionId, Date.now());
        }

        // Clear existing debounce timer
        const existing = timers.get(sessionId);
        if (existing) clearTimeout(existing);

        // Check if we've exceeded the max accumulation window
        const batchStart = batchStartTimes.get(sessionId)!;
        const maxWait = delaySec * MAX_ACCUMULATE_MULTIPLIER * 1000;
        const elapsed = Date.now() - batchStart;

        if (elapsed >= maxWait) {
            // Exceeded max window — flush immediately
            console.log(`[Accumulator] Max accumulation window reached for session ${sessionId}, flushing`);
            timers.delete(sessionId);
            batchStartTimes.delete(sessionId);
            await MessageAccumulator.flush(sessionId, callback);
            return;
        }

        // Schedule flush: use remaining max window or delaySec, whichever is shorter
        const remainingMax = maxWait - elapsed;
        const actualDelay = Math.min(delaySec * 1000, remainingMax);

        timers.set(sessionId, setTimeout(() => {
            timers.delete(sessionId);
            batchStartTimes.delete(sessionId);
            MessageAccumulator.flush(sessionId, callback).catch(e => {
                console.error(`[Accumulator] Flush error for session ${sessionId}:`, e);
            });
        }, actualDelay));
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
            batchStartTimes.delete(sessionId);
            await MessageAccumulator.flush(sessionId, callback);
        }

        // Also recover any orphaned Redis keys (from a previous crash)
        const keys = await redis.keys(`${REDIS_PREFIX}*`);
        for (const key of keys) {
            const sessionId = key.slice(REDIS_PREFIX.length);
            batchStartTimes.delete(sessionId);
            await MessageAccumulator.flush(sessionId, callback);
        }
    }

    static get pendingCount(): number {
        return timers.size;
    }
}
