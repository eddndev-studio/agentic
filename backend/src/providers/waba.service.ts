/**
 * WhatsApp Cloud API service — handles HTTP communication with Meta's Graph API.
 * Stateless: credentials come from bot config, no persistent connections.
 */
import { prisma } from '../services/postgres.service';
import { safeParseBotCredentials } from '../schemas';
import { config } from '../config';
import { createLogger } from '../logger';
import type { WABASendPayload, WABASendResponse, WABAMediaUrlResponse } from './waba.types';
import type { OutgoingPayload } from './types';

const log = createLogger('WABA');
const API_BASE = `https://graph.facebook.com/${config.waba.apiVersion}`;

export interface WABACredentials {
    accessToken: string;
    phoneNumberId: string;
}

// ── Credentials management ──────────────────────────────────────────────────
// WABA credentials live in Bot.credentials JSON — fetched from DB with short TTL cache.
// Baileys credentials are file-system managed by useMultiFileAuthState (no overlap).

const credentialsCache = new Map<string, { creds: WABACredentials; expiresAt: number }>();
const CREDS_CACHE_TTL = 60_000; // 1 minute

export async function getWABACredentials(botId: string): Promise<WABACredentials> {
    const cached = credentialsCache.get(botId);
    if (cached && cached.expiresAt > Date.now()) return cached.creds;

    const bot = await prisma.bot.findUnique({
        where: { id: botId },
        select: { credentials: true },
    });

    const parsed = safeParseBotCredentials(bot?.credentials);
    if (!parsed.wabaAccessToken || !parsed.wabaPhoneNumberId) {
        throw new Error(`Bot ${botId} missing WABA credentials (wabaAccessToken, wabaPhoneNumberId)`);
    }

    const creds: WABACredentials = {
        accessToken: parsed.wabaAccessToken,
        phoneNumberId: parsed.wabaPhoneNumberId,
    };

    credentialsCache.set(botId, { creds, expiresAt: Date.now() + CREDS_CACHE_TTL });
    return creds;
}

export function clearWABACredentialsCache(botId?: string): void {
    if (botId) credentialsCache.delete(botId);
    else credentialsCache.clear();
}

/**
 * Send a message via the Cloud API.
 * Returns the WABA message ID on success.
 */
export async function sendWABAMessage(
    creds: WABACredentials,
    to: string,
    payload: OutgoingPayload,
): Promise<string | null> {
    const body = buildSendPayload(to, payload);

    const res = await fetch(`${API_BASE}/${creds.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        log.error(`Send failed (${res.status}): ${err}`);
        return null;
    }

    const data = await res.json() as WABASendResponse;
    return data.messages?.[0]?.id ?? null;
}

/**
 * Mark messages as read via the Cloud API.
 */
export async function markWABARead(
    creds: WABACredentials,
    messageId: string,
): Promise<void> {
    await fetch(`${API_BASE}/${creds.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId,
        }),
    }).catch(err => log.warn('markRead failed:', err));
}

/**
 * Download media by its WABA media ID.
 * Two-step: get URL → download binary.
 */
export async function downloadWABAMedia(
    creds: WABACredentials,
    mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
        // Step 1: Get the media URL
        const metaRes = await fetch(`${API_BASE}/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${creds.accessToken}` },
            signal: AbortSignal.timeout(config.waba.mediaDownloadTimeout),
        });

        if (!metaRes.ok) {
            log.warn(`Media metadata fetch failed (${metaRes.status}) for ${mediaId}`);
            return null;
        }

        const meta = await metaRes.json() as WABAMediaUrlResponse;

        // Step 2: Download the binary
        const dlRes = await fetch(meta.url, {
            headers: { 'Authorization': `Bearer ${creds.accessToken}` },
            signal: AbortSignal.timeout(config.waba.mediaDownloadTimeout),
        });

        if (!dlRes.ok) {
            log.warn(`Media download failed (${dlRes.status}) for ${mediaId}`);
            return null;
        }

        const arrayBuffer = await dlRes.arrayBuffer();
        return {
            buffer: Buffer.from(arrayBuffer),
            mimeType: meta.mime_type,
        };
    } catch (err) {
        log.error(`Media download error for ${mediaId}:`, err);
        return null;
    }
}

// ── Payload builder ─────────────────────────────────────────────────────────

function buildSendPayload(to: string, payload: OutgoingPayload): WABASendPayload {
    const base: WABASendPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
    };

    switch (payload.type) {
        case 'TEXT':
            return {
                ...base,
                type: 'text',
                text: { body: payload.text, preview_url: !payload.skipLinkPreview },
            };
        case 'IMAGE':
            return {
                ...base,
                type: 'image',
                image: { link: payload.url, caption: payload.caption },
            };
        case 'VIDEO':
            return {
                ...base,
                type: 'video',
                video: { link: payload.url, caption: payload.caption },
            };
        case 'AUDIO':
            return {
                ...base,
                type: 'audio',
                audio: { link: payload.url },
            };
        case 'DOCUMENT':
            return {
                ...base,
                type: 'document',
                document: { link: payload.url, caption: payload.caption, filename: payload.fileName },
            };
        case 'REACTION':
            return {
                ...base,
                type: 'reaction',
                reaction: { message_id: payload.targetId, emoji: payload.emoji },
            };
        case 'REPLY':
            return {
                ...base,
                type: 'text',
                text: { body: payload.text },
                context: { message_id: payload.quotedId },
            };
    }
}
