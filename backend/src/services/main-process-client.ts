/**
 * HTTP client for worker → main process communication.
 * Wraps all /internal/* endpoints that the AI worker needs.
 */

const API_BASE = `http://127.0.0.1:${process.env['PORT'] || 8080}`;
const TIMEOUT = 30_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(url, {
                ...init,
                signal: AbortSignal.timeout(TIMEOUT),
            });
            // Don't retry client errors (4xx), only server errors (5xx)
            if (res.status >= 500) {
                const err = new Error(`HTTP ${res.status}`);
                if (attempt < MAX_RETRIES) {
                    const delay = BASE_DELAY_MS * 2 ** attempt;
                    console.error(`[MainProcessClient] Retry ${attempt + 1}/${MAX_RETRIES} for ${url}: ${err}`);
                    await new Promise((r) => setTimeout(r, delay));
                    continue;
                }
                // Last attempt — fall through so the caller gets the response as-is
            }
            return res;
        } catch (err) {
            lastError = err;
            if (attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * 2 ** attempt;
                console.error(`[MainProcessClient] Retry ${attempt + 1}/${MAX_RETRIES} for ${url}: ${err}`);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- HTTP response can be any JSON
async function post(path: string, body: Record<string, unknown>): Promise<any> {
    const url = `${API_BASE}${path}`;
    const res = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
        throw new Error(`[MainProcessClient] ${path} HTTP ${res.status}: ${data.error || "Unknown error"}`);
    }
    return data;
}

export const mainProcessClient = {
    async sendMessage(botId: string, target: string, payload: import('../providers/types').OutgoingPayload): Promise<void> {
        await post("/internal/send", { botId, target, payload });
    },

    async markRead(botId: string, chatJid: string, messageIds: string[]): Promise<void> {
        await post("/internal/mark-read", { botId, chatJid, messageIds });
    },

    async sendPresence(botId: string, chatJid: string, presence: "composing" | "paused"): Promise<void> {
        await post("/internal/presence", { botId, chatJid, presence });
    },

    async executeTool(
        botId: string,
        sessionId: string,
        toolName: string,
        toolArgs: Record<string, unknown>
    ): Promise<{ success: boolean; data: unknown; sentMessages?: boolean }> {
        return post("/internal/tool", { botId, sessionId, toolName, toolArgs });
    },

    /**
     * Forward an emulator debug event to the main process eventBus.
     * Fire-and-forget — errors are logged but never thrown.
     */
    async emitEmulatorDebug(event: Record<string, unknown>): Promise<void> {
        try {
            await post("/internal/emulator-event", { event });
        } catch (e) {
            console.warn("[MainProcessClient] emitEmulatorDebug failed:", (e as Error).message);
        }
    },
};

/**
 * Standalone sendMessage function for backward compatibility.
 * Delegates to mainProcessClient.sendMessage.
 */
export async function sendMessage(botId: string, target: string, payload: import('../providers/types').OutgoingPayload): Promise<void> {
    await mainProcessClient.sendMessage(botId, target, payload);
}
