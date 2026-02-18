import type { Message } from "@prisma/client";

interface AccumulatorEntry {
    messages: Message[];
    timer: ReturnType<typeof setTimeout>;
}

// In-memory accumulator: sessionId -> buffered messages + debounce timer
const buffers = new Map<string, AccumulatorEntry>();

export class MessageAccumulator {

    /**
     * Add a message to the accumulation buffer for a session.
     * Resets the debounce timer on each new message.
     * When the timer expires, invokes the callback with all accumulated messages.
     */
    static accumulate(
        sessionId: string,
        message: Message,
        delaySec: number,
        callback: (sessionId: string, messages: Message[]) => void
    ): void {
        const existing = buffers.get(sessionId);

        if (existing) {
            clearTimeout(existing.timer);
            existing.messages.push(message);
        } else {
            buffers.set(sessionId, {
                messages: [message],
                timer: null as any,
            });
        }

        const entry = buffers.get(sessionId)!;

        entry.timer = setTimeout(() => {
            const accumulated = entry.messages;
            buffers.delete(sessionId);
            console.log(`[Accumulator] Flushing ${accumulated.length} message(s) for session ${sessionId}`);
            callback(sessionId, accumulated);
        }, delaySec * 1000);
    }

    /**
     * Force-flush all pending buffers (for graceful shutdown).
     */
    static flushAll(callback: (sessionId: string, messages: Message[]) => void): void {
        for (const [sessionId, entry] of buffers) {
            clearTimeout(entry.timer);
            buffers.delete(sessionId);
            console.log(`[Accumulator] Force-flushing ${entry.messages.length} message(s) for session ${sessionId}`);
            callback(sessionId, entry.messages);
        }
    }

    static get pendingCount(): number {
        return buffers.size;
    }
}
