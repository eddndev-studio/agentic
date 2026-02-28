/**
 * Standalone BullMQ worker process.
 * Handles flow step execution independently from the main API server.
 * Sends messages via HTTP to the main process (which owns Baileys sessions).
 */
import { Worker, Job } from "bullmq";
import { QUEUE_NAME } from "./services/queue.service";
import { StepProcessor } from "./workers/processors/StepProcessor";

const REDIS_URL = process.env['REDIS_URL'] || "redis://localhost:6379";

console.log(`[Worker] Starting standalone worker on queue: ${QUEUE_NAME}`);

const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
        switch (job.name) {
            case "execute_step":
                await StepProcessor.process(job);
                break;
            default:
                console.warn(`[Worker] Ignoring unknown job: ${job.name}`);
        }
        return { processed: true };
    },
    {
        connection: { url: REDIS_URL },
        concurrency: 50,
    }
);

worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} (${job?.name}) failed:`, err);
});

// --- Graceful Shutdown ---
let isShuttingDown = false;

async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Worker] Received ${signal}, shutting down...`);

    try {
        await worker.close();
        console.log("[Worker] BullMQ worker closed.");
    } catch (e) {
        console.error("[Worker] Error closing worker:", e);
    }

    const { prisma } = await import("./services/postgres.service");
    try {
        await prisma.$disconnect();
    } catch {}

    console.log("[Worker] Shutdown complete.");
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
    console.error("[Worker] Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
    console.error("[Worker] Unhandled Rejection:", reason);
});
