/**
 * API Service Entry Point
 *
 * Stateless REST API server. All Baileys/AI operations are proxied
 * to Gateway instances via Redis commands.
 *
 * No Baileys, no AI Engine, no outgoing consumer.
 */

import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { cors } from "@elysiajs/cors";

// --- Configuration ---
const PORT = process.env.PORT || 8080;

// --- Global Error Handlers ---
process.on("uncaughtException", (err) => {
    console.error("!!!! Uncaught Exception !!!!", err);
});
process.on("unhandledRejection", (reason) => {
    console.error("!!!! Unhandled Rejection !!!!", reason);
});

// --- Controllers ---
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

const app = new Elysia({ adapter: node() })
    .use(cors({
        origin: [
            'https://app.angelviajero.com.mx',
            'http://localhost:4321',
            'http://localhost:5173'
        ],
        allowedHeaders: ['Content-Type', 'Authorization'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }))
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
    .get("/", () => "Agentic API Service Active")
    .get("/health", () => ({ status: "ok", service: "api", timestamp: new Date().toISOString() }))
    .get("/info", () => ({
        service: "Agentic API",
        version: "2.0.0",
    }))
    .listen({
        port: Number(PORT),
        hostname: '0.0.0.0'
    });

console.log(`Agentic API is running at 0.0.0.0:${PORT}`);
