import { Elysia, t } from "elysia";
import { node } from "@elysiajs/node";
import { initSystemLogger } from "./services/system-logger";
import { redis } from "./services/redis.service";

// --- System Logger (intercept console before anything else) ---
initSystemLogger();

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const AUTOMATION_INTERVAL = Number(process.env['AUTOMATION_CHECK_INTERVAL_MS']) || 30 * 60 * 1000;

// --- Global Error Handlers (Prevent Crash) ---
process.on('uncaughtException', (err) => {
    console.error('!!!! Uncaught Exception !!!!', err);
    // Do NOT exit the process, just log it.
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('!!!! Unhandled Rejection !!!!', reason);
    // Do NOT exit.
});

// --- Graceful Shutdown ---
import { MessageAccumulator } from "./services/accumulator.service";
import { aiEngine } from "./core/ai";
import { queueService } from "./services/queue.service";

let isShuttingDown = false;
let automationTimer: ReturnType<typeof setInterval> | null = null;

async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Shutdown] Received ${signal}, starting graceful shutdown...`);

    // 1. Stop automation timer
    if (automationTimer) clearInterval(automationTimer);

    // 2. Stop accepting new WhatsApp messages + cancel reconnect timers
    try {
        console.log("[Shutdown] Shutting down Baileys sessions...");
        await BaileysService.shutdownAll();
        console.log("[Shutdown] Baileys sessions closed.");
    } catch (e) {
        console.error("[Shutdown] Error shutting down Baileys:", e);
    }

    // 3. Flush pending message accumulator buffers (from Redis + active timers)
    try {
        console.log("[Shutdown] Flushing accumulator buffers...");
        await MessageAccumulator.flushAll((sid, msgs) => {
            aiEngine.processMessages(sid, msgs).catch(err => {
                console.error(`[Shutdown] Failed to process flushed messages for ${sid}:`, err);
            });
        });
    } catch (e) {
        console.error("[Shutdown] Error flushing accumulator:", e);
    }

    // 4. Close BullMQ queue (step jobs enqueued for the standalone worker)
    try {
        console.log("[Shutdown] Closing BullMQ queue...");
        await queueService.close();
        console.log("[Shutdown] BullMQ queue closed.");
    } catch (e) {
        console.error("[Shutdown] Error closing BullMQ:", e);
    }

    // 5. Disconnect Redis
    try {
        console.log("[Shutdown] Disconnecting Redis...");
        await redis.quit();
        console.log("[Shutdown] Redis disconnected.");
    } catch (e) {
        console.error("[Shutdown] Error disconnecting Redis:", e);
    }

    // 6. Disconnect Prisma
    try {
        console.log("[Shutdown] Disconnecting Prisma...");
        await prisma.$disconnect();
        console.log("[Shutdown] Prisma disconnected.");
    } catch (e) {
        console.error("[Shutdown] Error disconnecting Prisma:", e);
    }

    console.log("[Shutdown] Graceful shutdown complete.");
    process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// --- Baileys Init ---
import { prisma } from "./services/postgres.service";
import { BaileysService } from "./services/baileys.service";
import { Platform } from "@prisma/client";

// Reconnect WhatsApp Sessions
prisma.bot.findMany({ where: { platform: Platform.WHATSAPP } }).then(bots => {
    console.log(`[Init] Found ${bots.length} WhatsApp bots to reconnect...`);
    for (const bot of bots) {
        BaileysService.startSession(bot.id).catch(err => {
            console.error(`[Init] Failed to start session for ${bot.name}:`, err);
        });
    }
});

// --- Automation Scheduler (in-process, no BullMQ) ---
import { AutomationProcessor } from "./workers/processors/AutomationProcessor";

// Clean up any old BullMQ repeating automation jobs
queueService.removeRepeatableJobs().catch(() => {});

automationTimer = setInterval(() => {
    if (isShuttingDown) return;
    console.log("[Automation] Running scheduled automation check...");
    AutomationProcessor.processAll().catch(err => {
        console.error("[Automation] Error in scheduled check:", err);
    });
}, AUTOMATION_INTERVAL);

console.log(`[Init] Automation check scheduled (every ${AUTOMATION_INTERVAL / 60000} min)`);

// --- API ---
import { webhookController } from "./api/webhook.controller";
import { uploadController } from "./api/upload.controller";
import { flowController } from "./api/flow.controller";
import { botController } from "./api/bot.controller";
import { triggerController } from "./api/trigger.controller";
import { executionController } from "./api/execution.controller";
import { authController } from "./api/auth.controller";
import { clientRoutes } from "./api/client.routes";
import { toolController } from "./api/tool.controller";
import { sessionController } from "./api/session.controller";
import { eventsController } from "./api/events.controller";
import { automationController } from "./api/automation.controller";
import { logsController } from "./api/logs.controller";
const ALLOWED_ORIGINS = new Set([
    'https://agentic.w-gateway.cc',
    'https://agentic-api.w-gateway.cc',
    'http://localhost:4321',
    'http://localhost:5173',
]);

const app = new Elysia({ adapter: node() })
    .onRequest(({ request, set }) => {
        const headers = request.headers;
        let origin = '';
        if (typeof headers.get === 'function') {
            origin = headers.get('origin') || '';
        }
        if (!origin && typeof headers === 'object') {
            origin = (headers as any).origin || '';
        }

        if (ALLOWED_ORIGINS.has(origin)) {
            set.headers['Access-Control-Allow-Origin'] = origin;
            set.headers['Access-Control-Allow-Credentials'] = 'true';
        }
        set.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        set.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
        set.headers['Vary'] = 'Origin';

        if (request.method === 'OPTIONS') {
            set.status = 204;
            return '';
        }
    })
    // Internal endpoint for the standalone worker to send messages via Baileys
    .post("/internal/send", async ({ body, set }) => {
        const { botId, target, payload } = body as { botId: string; target: string; payload: any };
        try {
            await BaileysService.sendMessage(botId, target, payload);
            return { ok: true };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })
    .use(webhookController)
    .use(uploadController)
    .use(flowController)
    .use(botController)
    .use(triggerController)
    .use(executionController)
    .use(authController)
    .use(clientRoutes)
    .use(toolController)
    .use(sessionController)
    .use(eventsController)
    .use(automationController)
    .use(logsController)
    .get("/", () => "Agentic Orchestrator Active")
    .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
    .get("/info", () => ({
        service: "Agentic",
        version: "1.0.0",
        redis: redis.status
    }))
    .listen({
        port: Number(PORT),
        hostname: '0.0.0.0'
    });

console.log(
    `Agentic is running at 0.0.0.0:${PORT}`
);
