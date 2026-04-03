/**
 * WhatsApp Cloud API service — handles HTTP communication with Meta's Graph API.
 * Stateless: credentials come from bot config, no persistent connections.
 */
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
