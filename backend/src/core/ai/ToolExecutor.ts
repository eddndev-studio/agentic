import { prisma } from "../../services/postgres.service";
import { BaileysService } from "../../services/baileys.service";
import type { Session } from "@prisma/client";

export interface ToolResult {
    success: boolean;
    data: any;
}

export class ToolExecutor {

    /**
     * Execute a tool call by looking up the tool definition and dispatching by actionType.
     */
    static async execute(
        botId: string,
        session: Session,
        toolCall: { name: string; arguments: Record<string, any> },
        originalMessage?: { content?: string | null }
    ): Promise<ToolResult> {
        const tool = await prisma.tool.findFirst({
            where: { botId, name: toolCall.name, status: "ACTIVE" },
        });

        if (!tool) {
            return { success: false, data: `Tool '${toolCall.name}' not found or disabled.` };
        }

        try {
            switch (tool.actionType) {
                case "FLOW":
                    return await this.executeFlow(botId, session, tool, toolCall.arguments);
                case "WEBHOOK":
                    return await this.executeWebhook(tool, toolCall.arguments, session);
                case "BUILTIN":
                    return await this.executeBuiltin(botId, session, tool, toolCall.arguments);
                default:
                    return { success: false, data: `Unknown actionType: ${tool.actionType}` };
            }
        } catch (error: any) {
            console.error(`[ToolExecutor] Error executing tool '${toolCall.name}':`, error);
            return { success: false, data: error.message || "Tool execution failed" };
        }
    }

    /**
     * FLOW action: Execute a sequence of steps, interpolating {{param}} placeholders.
     */
    private static async executeFlow(
        botId: string,
        session: Session,
        tool: any,
        args: Record<string, any>
    ): Promise<ToolResult> {
        const flowId = tool.flowId || (tool.actionConfig as any)?.flowId;
        if (!flowId) {
            return { success: false, data: "No flowId configured for this tool." };
        }

        const flow = await prisma.flow.findUnique({
            where: { id: flowId },
            include: { steps: { orderBy: { order: "asc" } } },
        });

        if (!flow) {
            return { success: false, data: `Flow '${flowId}' not found.` };
        }

        const results: string[] = [];

        for (const step of flow.steps) {
            let content = step.content || "";

            // Interpolate {{param}} placeholders
            for (const [key, value] of Object.entries(args)) {
                content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
            }

            try {
                if (step.type === "TEXT" && content) {
                    await BaileysService.sendMessage(botId, session.identifier, { text: content });
                    results.push(`Sent text: ${content.substring(0, 50)}`);
                } else if (step.type === "IMAGE" && step.mediaUrl) {
                    await BaileysService.sendMessage(botId, session.identifier, {
                        image: { url: step.mediaUrl },
                        caption: content || undefined,
                    });
                    results.push("Sent image");
                } else if ((step.type === "AUDIO" || step.type === "PTT") && step.mediaUrl) {
                    await BaileysService.sendMessage(botId, session.identifier, {
                        audio: { url: step.mediaUrl },
                        ptt: step.type === "PTT",
                    });
                    results.push(`Sent ${step.type.toLowerCase()}`);
                }
            } catch (e: any) {
                results.push(`Failed step ${step.order}: ${e.message}`);
            }

            // Respect step delay
            if (step.delayMs > 0) {
                await new Promise((r) => setTimeout(r, step.delayMs));
            }
        }

        return { success: true, data: `Executed flow '${flow.name}' with ${flow.steps.length} steps. ${results.join("; ")}` };
    }

    /**
     * WEBHOOK action: POST to a URL with the tool arguments as body.
     */
    private static async executeWebhook(
        tool: any,
        args: Record<string, any>,
        session: Session
    ): Promise<ToolResult> {
        const config = tool.actionConfig as any;
        if (!config?.url) {
            return { success: false, data: "No webhook URL configured." };
        }

        const method = (config.method || "POST").toUpperCase();
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(config.headers || {}),
        };

        const res = await fetch(config.url, {
            method,
            headers,
            body: method !== "GET" ? JSON.stringify({ ...args, sessionId: session.id, identifier: session.identifier }) : undefined,
        });

        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }

        return { success: res.ok, data };
    }

    /**
     * BUILTIN action: Execute internal functions.
     */
    private static async executeBuiltin(
        botId: string,
        session: Session,
        tool: any,
        args: Record<string, any>
    ): Promise<ToolResult> {
        const config = tool.actionConfig as any;
        const builtinName = config?.builtinName || tool.name;

        switch (builtinName) {
            case "lookup_client": {
                const client = await prisma.client.findFirst({
                    where: {
                        botId,
                        OR: [
                            { phoneNumber: args.phoneNumber || session.identifier },
                            { email: args.email || "" },
                        ],
                    },
                    select: {
                        id: true, name: true, email: true, phoneNumber: true,
                        status: true, appointmentDate: true, captureLine: true,
                        contactNumber: true, createdAt: true,
                    },
                });
                return { success: !!client, data: client ?? "Client not found." };
            }

            case "register_client": {
                if (!args.name || !args.email || !args.phoneNumber) {
                    return { success: false, data: "Missing required fields: name, email, phoneNumber" };
                }
                // Import encryption service dynamically to avoid circular deps
                const { EncryptionService } = await import("../../services/encryption.service");
                const client = await prisma.client.create({
                    data: {
                        botId,
                        name: args.name,
                        email: args.email,
                        phoneNumber: args.phoneNumber,
                        encryptedPassword: EncryptionService.encrypt(args.password || "temp123"),
                        contactNumber: args.contactNumber,
                    },
                    select: { id: true, name: true, email: true, status: true },
                });
                return { success: true, data: client };
            }

            case "get_current_time": {
                const tz = args.timezone || "America/Mexico_City";
                const now = new Date().toLocaleString("es-MX", { timeZone: tz });
                return { success: true, data: { time: now, timezone: tz } };
            }

            case "clear_conversation": {
                const { ConversationService } = await import("../../services/conversation.service");
                await ConversationService.clear(session.id);
                return { success: true, data: "Conversation history cleared." };
            }

            default:
                return { success: false, data: `Unknown builtin: ${builtinName}` };
        }
    }
}
