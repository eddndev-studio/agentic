import { Elysia, t } from "elysia";
import { node } from "@elysiajs/node";
import { initSystemLogger } from "./services/system-logger";
import { redis } from "./services/redis.service";
import { config } from "./config";

// --- System Logger (intercept console before anything else) ---
initSystemLogger();

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
import { queueService } from "./services/queue.service";

let isShuttingDown = false;
let automationTimer: ReturnType<typeof setInterval> | null = null;
let fbSyncTimer: ReturnType<typeof setInterval> | null = null;

async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Shutdown] Received ${signal}, starting graceful shutdown...`);

    // 1. Stop timers
    if (automationTimer) clearInterval(automationTimer);
    if (fbSyncTimer) clearInterval(fbSyncTimer);

    // 2. Stop accepting new messages + cancel reconnect timers (all providers)
    try {
        console.log("[Shutdown] Shutting down messaging providers...");
        const { providerRegistry } = await import("./providers/registry");
        await providerRegistry.shutdownAll();
        console.log("[Shutdown] Messaging providers closed.");
    } catch (e) {
        console.error("[Shutdown] Error shutting down providers:", e);
    }

    // 3. Flush pending message accumulator buffers → enqueue for worker
    try {
        console.log("[Shutdown] Flushing accumulator buffers...");
        await MessageAccumulator.flushAll((sid, msgs) => {
            queueService.enqueueAIProcessing(sid, msgs.map(m => m.id)).catch(err => {
                console.error(`[Shutdown] Failed to enqueue flushed messages for ${sid}:`, err);
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

// --- Provider Init ---
import { prisma } from "./services/postgres.service";
import { providerRegistry } from "./providers/registry";
import { ToolExecutor } from "./core/ai/ToolExecutor";
import { eventBus, type BotEvent } from "./services/event-bus";
import { Platform } from "@prisma/client";

// Recover orphaned accumulator messages from a previous crash (Redis keys without in-memory timers)
MessageAccumulator.flushAll((sid, msgs) => {
    console.log(`[Init] Recovering ${msgs.length} orphaned message(s) for session ${sid}`);
    queueService.enqueueAIProcessing(sid, msgs.map(m => m.id)).catch(err => {
        console.error(`[Init] Failed to enqueue recovered messages for ${sid}:`, err);
    });
}).catch(err => {
    console.error("[Init] Accumulator recovery error:", err);
});

// Reconnect messaging sessions for all platforms
prisma.bot.findMany().then(bots => {
    console.log(`[Init] Found ${bots.length} bot(s) to reconnect...`);
    for (const bot of bots) {
        try {
            const provider = providerRegistry.get(bot.platform);
            provider.startSession(bot.id).catch(err => {
                console.error(`[Init] Failed to start session for ${bot.name}:`, err);
            });
        } catch (err) {
            console.warn(`[Init] No provider for ${bot.name} (${bot.platform}), skipping`);
        }
    }
});

// --- Notification Service ---
import { notificationService } from "./services/notification.service";
notificationService.init();

// --- Automation Scheduler (in-process, no BullMQ) ---
import { AutomationProcessor } from "./workers/processors/AutomationProcessor";

// Clean up any old BullMQ repeating automation jobs
queueService.removeRepeatableJobs().catch(e => console.warn('[Init] removeRepeatableJobs failed:', (e as Error).message));

automationTimer = setInterval(() => {
    if (isShuttingDown) return;
    console.log("[Automation] Running scheduled automation check...");
    AutomationProcessor.processAll().catch(err => {
        console.error("[Automation] Error in scheduled check:", err);
    });
}, config.server.automationInterval);

console.log(`[Init] Automation check scheduled (every ${config.server.automationInterval / 60000} min)`);

// --- Facebook Ads Sync ---
if (config.facebook.appId && config.facebook.appSecret) {
    const { FacebookService } = require("./services/facebook.service");
    fbSyncTimer = setInterval(() => {
        if (isShuttingDown) return;
        console.log("[FbSync] Running scheduled Facebook Ads sync...");
        FacebookService.syncAll().catch((err: Error) => {
            console.error("[FbSync] Error in scheduled sync:", err.message);
        });
    }, config.facebook.syncIntervalMs);
    console.log(`[Init] Facebook Ads sync scheduled (every ${config.facebook.syncIntervalMs / 3600000}h)`);
}

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
import { templateController } from "./api/template.controller";
import { logsController } from "./api/logs.controller";
import { emulatorController } from "./api/emulator.controller";
import { publicController } from "./api/public.controller";
import { financeController } from "./api/finance.controller";
const ALLOWED_ORIGINS = new Set(config.server.corsOrigins);

const app = new Elysia({ adapter: node() })
    .onRequest(({ request, set }) => {
        const headers = request.headers;
        let origin = '';
        if (typeof headers.get === 'function') {
            origin = headers.get('origin') || '';
        }
        if (!origin && typeof headers === 'object') {
            origin = (headers as unknown as Record<string, string>).origin || '';
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
    // Internal endpoint for the standalone worker to send messages via provider
    .post("/internal/send", async ({ body, set }) => {
        const { botId, target, payload } = body as { botId: string; target: string; payload: Record<string, unknown> };
        try {
            const provider = await providerRegistry.forBot(botId);
            await provider.sendMessage(botId, target, payload);
            return { ok: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : String(e) };
        }
    })
    // Internal endpoint for the standalone worker to execute tools via the main process
    .post("/internal/tool", async ({ body, set }) => {
        const { botId, sessionId, toolName, toolArgs } = body as {
            botId: string; sessionId: string; toolName: string; toolArgs: Record<string, unknown>;
        };
        try {
            const session = await prisma.session.findUnique({ where: { id: sessionId } });
            if (!session) { set.status = 404; return { error: "Session not found" }; }
            const result = await ToolExecutor.execute(botId, session, { name: toolName, arguments: toolArgs });
            return result;
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : String(e) };
        }
    })
    // Internal endpoint for the worker to mark messages as read
    .post("/internal/mark-read", async ({ body, set }) => {
        const { botId, chatJid, messageIds } = body as { botId: string; chatJid: string; messageIds: string[] };
        try {
            const provider = await providerRegistry.forBot(botId);
            await provider.markRead(botId, chatJid, messageIds);
            return { ok: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : String(e) };
        }
    })
    // Internal endpoint for the worker to send presence (composing/paused)
    .post("/internal/presence", async ({ body, set }) => {
        const { botId, chatJid, presence } = body as { botId: string; chatJid: string; presence: string };
        try {
            const provider = await providerRegistry.forBot(botId);
            await provider.sendPresence(botId, chatJid, presence as "composing" | "paused");
            return { ok: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : String(e) };
        }
    })
    // Internal endpoint for the worker to emit emulator debug events on the main-process eventBus
    .post("/internal/emulator-event", async ({ body, set }) => {
        const { event } = body as { event: BotEvent };
        try {
            eventBus.emitBotEvent(event);
            return { ok: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : String(e) };
        }
    })
    .use(publicController)
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
    .use(templateController)
    .use(logsController)
    .use(emulatorController)
    .use(financeController)
    .get("/", () => "Agentic Orchestrator Active")
    .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
    .get("/info", () => ({
        service: "Agentic",
        version: "1.0.0",
        redis: redis.status
    }))
    .listen({
        port: config.server.port,
        hostname: config.server.host,
    });

console.log(
    `Agentic is running at ${config.server.host}:${config.server.port}`
);
