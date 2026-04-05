import { redis } from "../services/redis.service";

/**
 * Sliding-window rate limiter backed by Redis.
 *
 * @param key     - A prefix that identifies this limiter (e.g. "auth:login")
 * @param limit   - Max requests allowed inside the window
 * @param windowS - Window size in seconds
 * @returns An Elysia-compatible `beforeHandle` guard that returns 429 when exceeded.
 */
export function rateLimit(key: string, limit: number, windowS: number) {
    return async ({ request, set }: { request: Request; set: { status: number; headers: Record<string, string> } }) => {
        const forwarded = request.headers.get("x-forwarded-for");
        const ip = forwarded?.split(",")[0]?.trim() || "unknown";
        const redisKey = `rl:${key}:${ip}`;
        const now = Date.now();

        // Atomic pipeline: remove expired entries, add current, count, set TTL
        const pipe = redis.pipeline();
        pipe.zremrangebyscore(redisKey, 0, now - windowS * 1000);
        pipe.zadd(redisKey, now.toString(), `${now}:${Math.random()}`);
        pipe.zcard(redisKey);
        pipe.expire(redisKey, windowS);

        const results = await pipe.exec();
        const count = (results?.[2]?.[1] as number) ?? 0;

        set.headers["X-RateLimit-Limit"] = String(limit);
        set.headers["X-RateLimit-Remaining"] = String(Math.max(0, limit - count));

        if (count > limit) {
            set.status = 429;
            set.headers["Retry-After"] = String(windowS);
            return { error: "Too many requests. Try again later." };
        }
    };
}
