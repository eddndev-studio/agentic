import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { config } from "./config";

// ─── Default values (no env vars set in CI / dev) ────────────────────────────
// These verify the fallback values baked into config.ts.
// If a dev happens to have one of these env vars set locally, the test will
// still pass because it checks the _actual_ evaluated config object, which
// is the correct behaviour — config should reflect whatever the env says.

describe("config defaults", () => {
    it("server.port is a number", () => {
        expect(typeof config.server.port).toBe("number");
    });

    it("server.host is a non-empty string", () => {
        expect(config.server.host.length).toBeGreaterThan(0);
    });

    it("server.corsOrigins is an array", () => {
        expect(Array.isArray(config.server.corsOrigins)).toBe(true);
        expect(config.server.corsOrigins.length).toBeGreaterThan(0);
    });

    it("baileys.decryptFailureThreshold is a positive number", () => {
        expect(config.baileys.decryptFailureThreshold).toBeGreaterThan(0);
    });

    it("baileys.watchdogTimeout is at least 1 minute", () => {
        expect(config.baileys.watchdogTimeout).toBeGreaterThanOrEqual(60_000);
    });

    it("baileys.qrTimeout is at least 10 seconds", () => {
        expect(config.baileys.qrTimeout).toBeGreaterThanOrEqual(10_000);
    });

    it("labels.dedupTtl is a positive number", () => {
        expect(config.labels.dedupTtl).toBeGreaterThan(0);
    });

    it("labels.dedupMax is a positive number", () => {
        expect(config.labels.dedupMax).toBeGreaterThan(0);
    });

    it("messageIngest.dedupTtl is a positive number", () => {
        expect(config.messageIngest.dedupTtl).toBeGreaterThan(0);
    });

    it("messageIngest.dedupMax is a positive number", () => {
        expect(config.messageIngest.dedupMax).toBeGreaterThan(0);
    });

    it("notifications.cacheTtl is a positive number", () => {
        expect(config.notifications.cacheTtl).toBeGreaterThan(0);
    });

    it("server.automationInterval is at least 1 minute", () => {
        expect(config.server.automationInterval).toBeGreaterThanOrEqual(60_000);
    });
});

// ─── Env var overrides ───────────────────────────────────────────────────────
// Uses vi.resetModules() to force re-evaluation of config.ts with modified env.

describe("config env var overrides", () => {
    const savedEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...savedEnv };
    });

    afterEach(() => {
        process.env = savedEnv;
    });

    it("PORT env var overrides server.port", async () => {
        process.env.PORT = "9999";
        const { config: freshConfig } = await import("./config");
        expect(freshConfig.server.port).toBe(9999);
    });

    it("HOST env var overrides server.host", async () => {
        process.env.HOST = "127.0.0.1";
        const { config: freshConfig } = await import("./config");
        expect(freshConfig.server.host).toBe("127.0.0.1");
    });

    it("DECRYPT_FAILURE_THRESHOLD env var overrides baileys setting", async () => {
        process.env.DECRYPT_FAILURE_THRESHOLD = "10";
        const { config: freshConfig } = await import("./config");
        expect(freshConfig.baileys.decryptFailureThreshold).toBe(10);
    });

    it("non-numeric PORT falls back to default", async () => {
        process.env.PORT = "not_a_number";
        const { config: freshConfig } = await import("./config");
        expect(freshConfig.server.port).toBe(8080);
    });

    it("CORS_ORIGINS env var overrides with comma-separated values", async () => {
        process.env.CORS_ORIGINS = "https://a.com,https://b.com";
        const { config: freshConfig } = await import("./config");
        expect(freshConfig.server.corsOrigins).toEqual(["https://a.com", "https://b.com"]);
    });
});
