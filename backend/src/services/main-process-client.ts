/**
 * HTTP client for worker → main process communication.
 * Wraps all /internal/* endpoints that the AI worker needs.
 */

const API_BASE = `http://127.0.0.1:${process.env['PORT'] || 8080}`;
const TIMEOUT = 30_000;

async function post(path: string, body: Record<string, any>): Promise<any> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`[MainProcessClient] ${path} HTTP ${res.status}: ${data.error || "Unknown error"}`);
    }
    return data;
}

export const mainProcessClient = {
    async sendMessage(botId: string, target: string, payload: any): Promise<void> {
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
        toolArgs: Record<string, any>
    ): Promise<{ success: boolean; data: any; sentMessages?: boolean }> {
        return post("/internal/tool", { botId, sessionId, toolName, toolArgs });
    },
};

/**
 * Standalone sendMessage function for backward compatibility.
 * Delegates to mainProcessClient.sendMessage.
 */
export async function sendMessage(botId: string, target: string, payload: any): Promise<void> {
    await mainProcessClient.sendMessage(botId, target, payload);
}
