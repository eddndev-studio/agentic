import { redis } from "./redis.service";
import { BaileysService } from "./baileys.service";
import { aiEngine } from "../core/ai";
import { prisma } from "./postgres.service";
import type { GatewayCommand, CommandResponse } from "./gateway-command.types";

const CONSUMER_NAME = `handler_${process.pid}`;

/**
 * Starts the command handler loop that reads commands from the
 * gateway:{gatewayId}:commands Redis Stream and dispatches them.
 */
export async function startCommandHandler(gatewayId: string): Promise<void> {
    const streamKey = `gateway:${gatewayId}:commands`;
    const groupName = `cmd_handler_${gatewayId}`;

    // Create consumer group (ignore if already exists)
    try {
        await redis.xgroup("CREATE", streamKey, groupName, "$", "MKSTREAM");
        console.log(`[CommandHandler] Created consumer group ${groupName}`);
    } catch (e: any) {
        if (!e.message?.includes("BUSYGROUP")) {
            console.error("[CommandHandler] Error creating consumer group:", e);
        }
    }

    console.log(`[CommandHandler] Listening on ${streamKey} as ${CONSUMER_NAME}`);

    const loop = async () => {
        while (true) {
            try {
                const results = await redis.xreadgroup(
                    "GROUP",
                    groupName,
                    CONSUMER_NAME,
                    "COUNT",
                    "10",
                    "BLOCK",
                    "5000",
                    "STREAMS",
                    streamKey,
                    ">"
                );

                if (!results) continue;

                for (const [_key, messages] of results) {
                    for (const [messageId, fields] of messages) {
                        await handleCommand(messageId, fields, streamKey, groupName);
                    }
                }
            } catch (e) {
                console.error("[CommandHandler] Error reading from stream:", e);
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
    };

    loop().catch((e) => {
        console.error("[CommandHandler] Fatal error:", e);
    });
}

async function handleCommand(
    messageId: string,
    fields: string[],
    streamKey: string,
    groupName: string
): Promise<void> {
    // Parse fields array [key, value, key, value, ...]
    let commandStr: string | undefined;
    for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === "command") {
            commandStr = fields[i + 1];
            break;
        }
    }

    if (!commandStr) {
        console.warn(`[CommandHandler] Message ${messageId} has no command field`);
        await redis.xack(streamKey, groupName, messageId);
        return;
    }

    let command: GatewayCommand;
    try {
        command = JSON.parse(commandStr);
    } catch (e) {
        console.error(`[CommandHandler] Failed to parse command ${messageId}:`, e);
        await redis.xack(streamKey, groupName, messageId);
        return;
    }

    let response: CommandResponse;

    try {
        switch (command.type) {
            case "START_SESSION":
                await BaileysService.startSession(command.botId);
                response = { success: true };
                break;

            case "STOP_SESSION":
                await BaileysService.stopSession(command.botId);
                response = { success: true };
                break;

            case "SEND_MESSAGE":
                await BaileysService.sendMessage(
                    command.botId,
                    command.payload.to,
                    command.payload.content
                );
                response = { success: true };
                break;

            case "FORCE_AI": {
                const { sessionId, messageId: msgId } = command.payload;
                // Load message from DB if messageId provided, otherwise create synthetic
                if (msgId) {
                    const msg = await prisma.message.findUnique({ where: { id: msgId } });
                    if (msg) {
                        aiEngine.processMessage(sessionId, msg).catch((err) => {
                            console.error("[CommandHandler] FORCE_AI error:", err);
                        });
                    }
                } else {
                    // Create synthetic message for force-ai without a specific message
                    const syntheticMsg = await prisma.message.create({
                        data: {
                            externalId: `force_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                            sessionId,
                            sender: "operator",
                            content: command.payload.context || "[Operator forced AI response]",
                            type: "TEXT",
                            fromMe: false,
                            isProcessed: false,
                        },
                    });
                    aiEngine.processMessage(sessionId, syntheticMsg).catch((err) => {
                        console.error("[CommandHandler] FORCE_AI error:", err);
                    });
                }
                response = { success: true };
                break;
            }

            case "SYNC_LABELS":
                await BaileysService.syncLabels(command.botId);
                response = { success: true };
                break;

            case "ADD_CHAT_LABEL":
                await BaileysService.addChatLabel(
                    command.botId,
                    command.payload.chatJid,
                    command.payload.waLabelId
                );
                response = { success: true };
                break;

            case "REMOVE_CHAT_LABEL":
                await BaileysService.removeChatLabel(
                    command.botId,
                    command.payload.chatJid,
                    command.payload.waLabelId
                );
                response = { success: true };
                break;

            default:
                response = { success: false, error: `Unknown command type: ${(command as any).type}` };
        }
    } catch (e: any) {
        console.error(`[CommandHandler] Error executing ${command.type} for bot ${command.botId}:`, e);
        response = { success: false, error: e.message || String(e) };
    }

    // Respond via RPUSH + EXPIRE
    try {
        const pipeline = redis.pipeline();
        pipeline.rpush(command.replyTo, JSON.stringify(response));
        pipeline.expire(command.replyTo, 30);
        await pipeline.exec();
    } catch (e) {
        console.error(`[CommandHandler] Failed to send reply to ${command.replyTo}:`, e);
    }

    // ACK
    await redis.xack(streamKey, groupName, messageId);
}
