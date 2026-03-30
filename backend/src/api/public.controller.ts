import { Elysia, t } from "elysia";
import crypto from "node:crypto";
import { prisma } from "../services/postgres.service";
import { BaileysService } from "../services/baileys.service";
import { eventBus } from "../services/event-bus";

// ── Token validation helper ─────────────────────────────────────────────────

async function validateConnectToken(token: string) {
    const record = await prisma.connectToken.findUnique({
        where: { token },
        include: { bot: { select: { id: true, name: true } } },
    });
    if (!record) return null;
    if (record.usedAt) return null;
    if (record.expiresAt < new Date()) return null;
    return record;
}

// ── Public controller (NO auth middleware) ───────────────────────────────────

export const publicController = new Elysia({ prefix: "/public" })

    // Validate a connect token
    .get("/connect/validate", async ({ query, set }) => {
        const record = await validateConnectToken(query.token);
        if (!record) {
            return { valid: false, reason: "Token invalid, expired, or already used" };
        }
        return {
            valid: true,
            botId: record.bot.id,
            botName: record.bot.name,
            expiresAt: record.expiresAt.toISOString(),
        };
    }, {
        query: t.Object({ token: t.String() }),
    })

    // Start a WhatsApp session via connect token
    .post("/connect/start", async ({ body, set }) => {
        const record = await validateConnectToken(body.token);
        if (!record) {
            set.status = 403;
            return { error: "Token invalid, expired, or already used" };
        }
        try {
            await BaileysService.startSession(record.botId);
            return { success: true, botId: record.botId };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }, {
        body: t.Object({ token: t.String() }),
    })

    // Get QR code via connect token
    .get("/connect/qr", async ({ query, set }) => {
        const record = await validateConnectToken(query.token);
        if (!record) {
            set.status = 403;
            return { error: "Token invalid, expired, or already used" };
        }
        const qr = BaileysService.getQR(record.botId);
        if (!qr) {
            set.status = 404;
            return { message: "QR not generated or session already connected" };
        }
        return { qr };
    }, {
        query: t.Object({ token: t.String() }),
    })

    // Get connection status via connect token
    .get("/connect/status", async ({ query, set }) => {
        const record = await validateConnectToken(query.token);
        if (!record) {
            set.status = 403;
            return { error: "Token invalid, expired, or already used" };
        }
        const session = BaileysService.getSession(record.botId);
        const qr = BaileysService.getQR(record.botId);
        return {
            connected: !!session?.user,
            hasQr: !!qr,
            user: session?.user,
        };
    }, {
        query: t.Object({ token: t.String() }),
    })

    // Request pairing code via connect token
    .post("/connect/pairing-code", async ({ body, set }) => {
        const record = await validateConnectToken(body.token);
        if (!record) {
            set.status = 403;
            return { error: "Token invalid, expired, or already used" };
        }
        try {
            const code = await BaileysService.requestPairingCode(record.botId, body.phoneNumber);
            // Format as XXXX-XXXX
            const formatted = code.length === 8
                ? `${code.slice(0, 4)}-${code.slice(4)}`
                : code;
            eventBus.emitBotEvent({ type: 'bot:pairing-code', botId: record.botId, code: formatted });
            return { code: formatted };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }, {
        body: t.Object({ token: t.String(), phoneNumber: t.String() }),
    })

    // SSE stream authenticated by connect token (not JWT)
    .get("/connect/stream", async ({ query, set, request }) => {
        const record = await validateConnectToken(query.token);
        if (!record) {
            set.status = 403;
            return { error: "Token invalid, expired, or already used" };
        }

        const botId = record.botId;
        const tokenId = record.id;

        set.headers['content-type'] = 'text/event-stream; charset=utf-8';
        set.headers['cache-control'] = 'no-cache';
        set.headers['connection'] = 'keep-alive';
        set.headers['x-accel-buffering'] = 'no';

        let unsubscribe: (() => void) | null = null;
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                const enqueue = (data: object | string) => {
                    try {
                        const payload = typeof data === 'string' ? data : JSON.stringify(data);
                        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                    } catch {} // stream may be closed
                };

                enqueue({ type: 'connected', botId });

                unsubscribe = eventBus.subscribe(botId, (event) => {
                    enqueue(event);
                    // Consume token when bot successfully connects
                    if (event.type === 'bot:connected') {
                        prisma.connectToken.update({
                            where: { id: tokenId },
                            data: { usedAt: new Date() },
                        }).catch(() => {}); // best-effort
                    }
                });

                heartbeatTimer = setInterval(() => {
                    try { controller.enqueue(encoder.encode(': ping\n\n')); }
                    catch { if (heartbeatTimer) clearInterval(heartbeatTimer); }
                }, 30_000);

                request.signal.addEventListener('abort', () => {
                    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
                    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
                    try { controller.close(); } catch {}
                }, { once: true });
            },
            cancel() {
                if (unsubscribe) { unsubscribe(); unsubscribe = null; }
                if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
            },
        });

        return stream;
    }, {
        query: t.Object({ token: t.String() }),
    });
