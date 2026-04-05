// ─── Centralized configuration ───────────────────────────────────────────────
// Every magic number / hardcoded value lives here.
// Each setting can be overridden with an environment variable.

function env(key: string, fallback: string): string {
    return process.env[key] || fallback;
}

function envRequired(key: string): string {
    const v = process.env[key];
    if (!v) throw new Error(`[Config] Missing required environment variable: ${key}`);
    return v;
}

function envInt(key: string, fallback: number): number {
    const v = parseInt(process.env[key] || '', 10);
    return Number.isNaN(v) ? fallback : v;
}

export const config = {
    // ── Auth / JWT ──────────────────────────────────────────────────────────
    jwt: {
        secret: envRequired('JWT_SECRET'),
    },

    // ── Server / HTTP ────────────────────────────────────────────────────────
    server: {
        port: envInt('PORT', 8080),
        host: env('HOST', '0.0.0.0'),
        corsOrigins: env(
            'CORS_ORIGINS',
            'https://agentic.w-gateway.cc,https://agentic-api.w-gateway.cc,http://localhost:4321,http://localhost:5173',
        ).split(','),
        automationInterval: envInt('AUTOMATION_CHECK_INTERVAL_MS', 30 * 60 * 1000),
        logLevel: env('LOG_LEVEL', 'info'),
    },

    // ── Baileys (WhatsApp socket) ────────────────────────────────────────────
    baileys: {
        /** Consecutive decryption failures before purging Signal sessions */
        decryptFailureThreshold: envInt('DECRYPT_FAILURE_THRESHOLD', 5),
        /** Minimum time between automatic Signal session purges (ms) */
        purgeCooldown: envInt('PURGE_COOLDOWN_MS', 6 * 60 * 60 * 1000),
        /** No-message timeout before forcing a reconnect (ms) */
        watchdogTimeout: envInt('WATCHDOG_TIMEOUT_MS', 30 * 60 * 1000),
        /** Window after connect in which "append" (offline) messages are processed (ms) */
        appendGracePeriod: envInt('APPEND_GRACE_PERIOD_MS', 60 * 1000),
        /** QR code generation timeout (ms) */
        qrTimeout: envInt('QR_TIMEOUT_MS', 60_000),
    },

    // ── Label service ────────────────────────────────────────────────────────
    labels: {
        /** Dedup window for label events (ms) */
        dedupTtl: envInt('LABEL_DEDUP_TTL_MS', 30_000),
        /** Maximum entries in the label dedup cache */
        dedupMax: envInt('LABEL_DEDUP_MAX', 10_000),
        /** Interval between periodic label reconciliation runs (ms) */
        reconcileInterval: envInt('LABEL_RECONCILE_INTERVAL_MS', 5 * 60 * 1000),
    },

    // ── Message ingest ───────────────────────────────────────────────────────
    messageIngest: {
        /** How long a message ID stays in the dedup cache (ms) */
        dedupTtl: envInt('MESSAGE_DEDUP_TTL_MS', 20 * 60 * 1000),
        /** Maximum entries in the in-memory dedup cache */
        dedupMax: envInt('MESSAGE_DEDUP_MAX', 5_000),
    },

    // ── Notification service ─────────────────────────────────────────────────
    notifications: {
        /** Bot config cache TTL (ms) */
        cacheTtl: envInt('NOTIFICATION_CACHE_TTL_MS', 30_000),
    },
    // ── WhatsApp Cloud API (WABA) ──────────────────────────────────────────
    waba: {
        /** Graph API version */
        apiVersion: env('WABA_API_VERSION', 'v21.0'),
        /** Media download timeout (ms) */
        mediaDownloadTimeout: envInt('WABA_MEDIA_DOWNLOAD_TIMEOUT_MS', 30_000),
    },

    // ── Facebook Ads ──────────────────────────────────────────────────────
    facebook: {
        appId: env('FB_APP_ID', ''),
        appSecret: env('FB_APP_SECRET', ''),
        syncIntervalMs: envInt('FB_SYNC_INTERVAL_MS', 2 * 60 * 60 * 1000),
        insightsDaysBack: envInt('FB_INSIGHTS_DAYS_BACK', 7),
    },
} as const;
