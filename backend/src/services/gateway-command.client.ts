import { redis } from "./redis.service";
import { Redis } from "ioredis";
import { getGatewayForBot } from "./gateway-registry";
import type { CommandType, GatewayCommand, CommandResponse } from "./gateway-command.types";

// Dedicated Redis client for BRPOP (blocking call needs its own connection)
const REDIS_URL = process.env["REDIS_URL"] || "redis://localhost:6379";
const blockingRedis = new Redis(REDIS_URL);

blockingRedis.on("error", (err) => {
    console.error("[CommandClient] Blocking Redis error:", err);
});

let commandCounter = 0;

/**
 * Send a command to the gateway responsible for a bot and wait for a response.
 *
 * @param botId - The bot to target
 * @param type - Command type
 * @param payload - Command-specific payload
 * @param timeoutMs - Max time to wait for response (default 15s)
 * @returns CommandResponse from the gateway
 * @throws Error on timeout or if no gateway is assigned
 */
export async function sendCommand(
    botId: string,
    type: CommandType,
    payload: Record<string, any> = {},
    timeoutMs: number = 15_000
): Promise<CommandResponse> {
    // 1. Look up gateway assignment
    const gatewayId = await getGatewayForBot(botId);
    if (!gatewayId) {
        throw new Error(`No gateway assigned for bot ${botId}`);
    }

    // 2. Generate command ID and reply key
    const commandId = `${Date.now()}-${process.pid}-${++commandCounter}`;
    const replyTo = `cmd:reply:${commandId}`;

    const command: GatewayCommand = {
        id: commandId,
        type,
        botId,
        payload,
        replyTo,
    };

    // 3. XADD command to gateway stream
    const streamKey = `gateway:${gatewayId}:commands`;
    await redis.xadd(
        streamKey,
        "MAXLEN",
        "~",
        "1000",
        "*",
        "command",
        JSON.stringify(command)
    );

    // 4. BRPOP for response (blocks until response or timeout)
    const timeoutSeconds = Math.ceil(timeoutMs / 1000);
    const result = await blockingRedis.brpop(replyTo, timeoutSeconds);

    if (!result) {
        // Clean up the reply key in case it arrives late
        redis.del(replyTo).catch(() => {});
        throw new Error(`Command ${type} for bot ${botId} timed out after ${timeoutMs}ms`);
    }

    // result is [key, value]
    const [, responseStr] = result;

    try {
        return JSON.parse(responseStr) as CommandResponse;
    } catch {
        return { success: false, error: "Failed to parse gateway response" };
    }
}

/**
 * Send a command without waiting for a response (fire-and-forget).
 */
export async function sendCommandFireAndForget(
    botId: string,
    type: CommandType,
    payload: Record<string, any> = {}
): Promise<void> {
    const gatewayId = await getGatewayForBot(botId);
    if (!gatewayId) {
        console.warn(`[CommandClient] No gateway assigned for bot ${botId}, dropping ${type}`);
        return;
    }

    const commandId = `${Date.now()}-${process.pid}-${++commandCounter}`;
    // Use a dummy replyTo since we won't listen for it
    const replyTo = `cmd:reply:${commandId}`;

    const command: GatewayCommand = {
        id: commandId,
        type,
        botId,
        payload,
        replyTo,
    };

    const streamKey = `gateway:${gatewayId}:commands`;
    await redis.xadd(
        streamKey,
        "MAXLEN",
        "~",
        "1000",
        "*",
        "command",
        JSON.stringify(command)
    );
}
