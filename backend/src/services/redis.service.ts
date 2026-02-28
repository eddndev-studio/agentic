import { Redis } from "ioredis";

// Singleton Redis client for general usage (caching, state, accumulator)
// BullMQ Queue and Worker create their own dedicated connections
const REDIS_URL = process.env['REDIS_URL'] || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ compatibility
});

redis.on("error", (err) => {
    console.error("Global Redis Client Error", err);
});

redis.on("connect", () => {
    console.log("Global Redis Connected");
});
