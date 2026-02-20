/**
 * Gateway Service Entry Point
 *
 * Runs Baileys sessions, AI Engine, outgoing consumer, and command handler
 * for a subset of bots assigned to this gateway instance.
 *
 * Required env: GATEWAY_ID (e.g. "gw-1")
 * Optional env: GATEWAY_HEALTH_PORT (default 9001)
 */

import { createServer } from "node:http";

// --- Configuration ---
const GATEWAY_ID = process.env.GATEWAY_ID;
if (!GATEWAY_ID) {
    console.error("[Gateway] GATEWAY_ID environment variable is required");
    process.exit(1);
}
const HEALTH_PORT = Number(process.env.GATEWAY_HEALTH_PORT) || 9001;

// --- Global Error Handlers ---
process.on("uncaughtException", (err) => {
    console.error("!!!! Uncaught Exception !!!!", err);
});
process.on("unhandledRejection", (reason) => {
    console.error("!!!! Unhandled Rejection !!!!", reason);
});

// --- Services ---
import { prisma } from "./services/postgres.service";
import { BaileysService } from "./services/baileys.service";
import { registerGateway, startHeartbeat, stopHeartbeat, getGatewayBots, assignBotToGateway } from "./services/gateway-registry";
import { startOutgoingConsumer } from "./services/outgoing-stream.consumer";
import { startCommandHandler } from "./services/gateway-command.handler";
import { Platform } from "@prisma/client";

async function main() {
    console.log(`[Gateway] Starting gateway ${GATEWAY_ID}...`);

    // 1. Register gateway + start heartbeat
    await registerGateway(GATEWAY_ID);
    startHeartbeat(GATEWAY_ID);

    // 2. Load assigned bots
    let botIds = await getGatewayBots(GATEWAY_ID);

    // If no bots assigned yet, assign all WHATSAPP bots to this gateway (first-run migration)
    if (botIds.length === 0) {
        const bots = await prisma.bot.findMany({ where: { platform: Platform.WHATSAPP } });
        for (const bot of bots) {
            await assignBotToGateway(bot.id, GATEWAY_ID);
        }
        botIds = bots.map((b) => b.id);
        console.log(`[Gateway] First run: assigned ${botIds.length} bots to ${GATEWAY_ID}`);
    }

    console.log(`[Gateway] ${botIds.length} bot(s) assigned to ${GATEWAY_ID}`);

    // 3. Start Baileys sessions for each assigned bot
    for (const botId of botIds) {
        BaileysService.startSession(botId).catch((err) => {
            console.error(`[Gateway] Failed to start session for bot ${botId}:`, err);
        });
    }

    // 4. Start outgoing stream consumer (per-gateway stream)
    startOutgoingConsumer();

    // 5. Start command handler (gateway:{GATEWAY_ID}:commands)
    startCommandHandler(GATEWAY_ID);

    // 6. Minimal HTTP health check
    const server = createServer((req, res) => {
        if (req.url === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                status: "ok",
                gatewayId: GATEWAY_ID,
                bots: botIds.length,
                timestamp: new Date().toISOString(),
            }));
        } else {
            res.writeHead(404);
            res.end("Not Found");
        }
    });

    server.listen(HEALTH_PORT, "0.0.0.0", () => {
        console.log(`[Gateway] Health check listening on 0.0.0.0:${HEALTH_PORT}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
        console.log(`[Gateway] Shutting down ${GATEWAY_ID}...`);
        stopHeartbeat();
        server.close();
        process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
}

main().catch((err) => {
    console.error("[Gateway] Fatal startup error:", err);
    process.exit(1);
});
