import { redis } from "./redis.service";

const REGISTRY_KEY = "gateway:registry";
const ASSIGNMENTS_KEY = "gateway:assignments";
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TTL_S = 30;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Register a gateway in the registry set and create a heartbeat key with TTL.
 */
export async function registerGateway(gatewayId: string): Promise<void> {
    await redis.sadd(REGISTRY_KEY, gatewayId);
    await redis.set(`gateway:heartbeat:${gatewayId}`, Date.now().toString(), "EX", HEARTBEAT_TTL_S);
    console.log(`[GatewayRegistry] Registered gateway ${gatewayId}`);
}

/**
 * Start a periodic heartbeat that refreshes the TTL every 10s.
 */
export function startHeartbeat(gatewayId: string): void {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
        try {
            await redis.set(`gateway:heartbeat:${gatewayId}`, Date.now().toString(), "EX", HEARTBEAT_TTL_S);
        } catch (e) {
            console.error(`[GatewayRegistry] Heartbeat failed for ${gatewayId}:`, e);
        }
    }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop the heartbeat timer (for graceful shutdown).
 */
export function stopHeartbeat(): void {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

/**
 * Get which gateway a bot is assigned to.
 */
export async function getGatewayForBot(botId: string): Promise<string | null> {
    return redis.hget(ASSIGNMENTS_KEY, botId);
}

/**
 * Assign a bot to a specific gateway.
 */
export async function assignBotToGateway(botId: string, gatewayId: string): Promise<void> {
    await redis.hset(ASSIGNMENTS_KEY, botId, gatewayId);
    await redis.sadd(`gateway:${gatewayId}:bots`, botId);
}

/**
 * Unassign a bot from its current gateway.
 */
export async function unassignBot(botId: string): Promise<void> {
    const gatewayId = await redis.hget(ASSIGNMENTS_KEY, botId);
    await redis.hdel(ASSIGNMENTS_KEY, botId);
    if (gatewayId) {
        await redis.srem(`gateway:${gatewayId}:bots`, botId);
    }
}

/**
 * Get all bots assigned to a specific gateway.
 */
export async function getGatewayBots(gatewayId: string): Promise<string[]> {
    return redis.smembers(`gateway:${gatewayId}:bots`);
}

/**
 * Find the gateway with the fewest assigned bots.
 */
export async function getLeastLoadedGateway(): Promise<string | null> {
    const gateways = await redis.smembers(REGISTRY_KEY);
    if (gateways.length === 0) return null;

    let minCount = Infinity;
    let leastLoaded: string | null = null;

    for (const gw of gateways) {
        // Only consider gateways with active heartbeats
        const alive = await redis.exists(`gateway:heartbeat:${gw}`);
        if (!alive) continue;

        const count = await redis.scard(`gateway:${gw}:bots`);
        if (count < minCount) {
            minCount = count;
            leastLoaded = gw;
        }
    }

    return leastLoaded;
}
