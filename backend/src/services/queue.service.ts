import { Queue } from "bullmq";

export const QUEUE_NAME = "agentic-message-queue";

class QueueService {
    private queue: Queue;

    constructor() {
        this.queue = new Queue(QUEUE_NAME, {
            connection: {
                url: process.env['REDIS_URL'] || "redis://localhost:6379"
            }
        });
    }

    async scheduleStepExecution(executionId: string, stepId: string, delayMs: number) {
        return this.queue.add("execute_step", { executionId, stepId }, { delay: delayMs });
    }

    async enqueueAIProcessing(sessionId: string, messageIds: string[]) {
        return this.queue.add("process_ai", { sessionId, messageIds }, {
            attempts: 1,
            removeOnComplete: 100,
            removeOnFail: 200,
        });
    }

    /** Remove legacy BullMQ repeating jobs (automations moved to in-process setInterval) */
    async removeRepeatableJobs() {
        const repeatableJobs = await this.queue.getRepeatableJobs();
        for (const job of repeatableJobs) {
            await this.queue.removeRepeatableByKey(job.key);
            console.log(`[Queue] Removed repeatable job: ${job.name} (${job.key})`);
        }
    }

    async close() {
        await this.queue.close();
    }
}

export const queueService = new QueueService();
