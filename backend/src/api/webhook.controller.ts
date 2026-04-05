import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { aiEngine } from "../core/ai";
import { MessageAccumulator } from "../services/accumulator.service";
import { Platform, SessionStatus } from "@prisma/client";
import { safeParseBotCredentials } from "../schemas";
import { handleWABAWebhook } from "../providers/waba.adapter";
import type { WABAWebhookPayload } from "../providers/waba.types";

export const webhookController = new Elysia({ prefix: "/webhook" })
    .post("/:platform", async ({ params, body, headers, set }) => {
        const { platform } = params;
        // body is typed by Elysia's t.Object() below

        const { from, content, type = "text", fromMe = false } = body;

        if (!['whatsapp', 'whatsapp_cloud', 'telegram'].includes(platform.toLowerCase())) {
            set.status = 400;
            return "Invalid platform";
        }

        const platformEnum = platform.toUpperCase() as Platform;

        console.log(`[Webhook] Received ${type} from ${from} on ${platformEnum}`);

        try {
            // 1. Resolve Bot (Target System)
            if (!body.botId) {
                set.status = 400;
                return "botId is required";
            }
            const botIdentifier = body.botId;

            const bot = await prisma.bot.findUnique({
                where: { identifier: botIdentifier }
            });

            if (!bot) {
                set.status = 404;
                return `Bot '${botIdentifier}' not found`;
            }

            // Reject if bot is paused
            if (bot.paused) {
                set.status = 503;
                return "Bot is currently paused";
            }

            // Verify webhook secret (required — configure one in bot credentials)
            const webhookSecret = safeParseBotCredentials(bot.credentials).webhookSecret;
            if (!webhookSecret) {
                console.warn(`[Webhook] Bot '${botIdentifier}' has no webhookSecret configured — rejecting request`);
                set.status = 403;
                return "Webhook secret not configured for this bot";
            }
            const providedSecret = headers['x-webhook-secret'];
            if (providedSecret !== webhookSecret) {
                set.status = 401;
                return "Invalid webhook secret";
            }

            // 2. Resolve Session (with race-condition handling)
            let session = await prisma.session.findUnique({
                where: {
                    botId_identifier: {
                        botId: bot.id,
                        identifier: from
                    }
                }
            });

            if (!session) {
                console.log(`[Webhook] New Session for user ${from} on bot ${bot.name}`);
                try {
                    session = await prisma.session.create({
                        data: {
                            botId: bot.id,
                            platform: platformEnum,
                            identifier: from,
                            name: `User ${from}`,
                            status: SessionStatus.CONNECTED
                        }
                    });
                } catch (e: unknown) {
                    if (e instanceof Error && 'code' in e && (e as Record<string, unknown>).code === 'P2002') {
                        session = await prisma.session.findUnique({
                            where: { botId_identifier: { botId: bot.id, identifier: from } },
                        });
                        if (!session) throw e;
                    } else {
                        throw e;
                    }
                }
            }

            // 3. Persist Message
            const message = await prisma.message.create({
                data: {
                    externalId: `msg_${Date.now()}_${Math.random()}`,
                    sessionId: session.id,
                    sender: from,
                    fromMe,
                    content,
                    type: type.toUpperCase(),
                    isProcessed: false
                }
            });

            // 4. Skip bot's own messages
            if (fromMe) {
                return { status: "received", messageId: message.id, bot: bot.name };
            }

            // 5. Process with AI Engine (with optional message accumulation)
            if (bot.messageDelay > 0) {
                MessageAccumulator.accumulate(
                    session.id,
                    message,
                    bot.messageDelay,
                    (sid, msgs) => {
                        aiEngine.processMessages(sid, msgs).catch(err => {
                            console.error("[Webhook] AI Engine Error:", err);
                        });
                    }
                ).catch(err => console.error("[Webhook] Accumulator error:", err));
            } else {
                aiEngine.processMessage(session.id, message).catch(err => {
                    console.error("[Webhook] AI Engine Error:", err);
                });
            }

            return { status: "received", messageId: message.id, bot: bot.name };

        } catch (err: unknown) {
            console.error("[Webhook] Error:", err);
            set.status = 500;
            return err instanceof Error ? err.message : String(err);
        }
    }, {
        body: t.Object({
            from: t.String(),
            content: t.String(),
            type: t.Optional(t.String()),
            botId: t.Optional(t.String()),
            fromMe: t.Optional(t.Boolean())
        })
    })

    // ── WhatsApp Cloud API (WABA) webhook ────────────────────────────────────
    // GET  /webhook/waba/:botId — Meta verification challenge
    // POST /webhook/waba/:botId — Incoming messages from Meta

    .get("/waba/:botId", async ({ params, query, set }) => {
        const mode = query['hub.mode'];
        const token = query['hub.verify_token'];
        const challenge = query['hub.challenge'];

        if (mode !== 'subscribe' || !token || !challenge) {
            set.status = 400;
            return 'Missing verification parameters';
        }

        const bot = await prisma.bot.findUnique({
            where: { id: params.botId },
            select: { credentials: true },
        });

        const creds = safeParseBotCredentials(bot?.credentials);
        if (token !== creds.wabaWebhookVerifyToken) {
            set.status = 403;
            return 'Invalid verify token';
        }

        console.log(`[WABA Webhook] Verification successful for bot ${params.botId}`);
        return challenge;
    }, {
        params: t.Object({ botId: t.String() }),
        query: t.Object({
            'hub.mode': t.Optional(t.String()),
            'hub.verify_token': t.Optional(t.String()),
            'hub.challenge': t.Optional(t.String()),
        }),
    })

    .post("/waba/:botId", async ({ params, body, set }) => {
        const payload = body as unknown as WABAWebhookPayload;

        if (payload.object !== 'whatsapp_business_account') {
            set.status = 400;
            return 'Invalid payload';
        }

        // Process asynchronously — Meta expects a quick 200
        handleWABAWebhook(params.botId, payload).catch(err => {
            console.error(`[WABA Webhook] Error processing for bot ${params.botId}:`, err);
        });

        return 'OK';
    }, {
        params: t.Object({ botId: t.String() }),
    });
