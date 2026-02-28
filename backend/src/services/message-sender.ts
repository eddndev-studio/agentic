/**
 * Abstraction for sending WhatsApp messages.
 * In the worker process, sends via HTTP to the main API.
 * In the main process, calls BaileysService directly.
 */

const API_BASE = `http://127.0.0.1:${process.env['PORT'] || 8080}`;

export async function sendMessage(botId: string, target: string, payload: any): Promise<void> {
    const res = await fetch(`${API_BASE}/internal/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId, target, payload }),
        signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`[MessageSender] HTTP ${res.status}: ${text}`);
    }
}
