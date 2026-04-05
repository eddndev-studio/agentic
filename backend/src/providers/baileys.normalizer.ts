/**
 * Baileys Message Normalizer
 *
 * Transforms a raw Baileys WAMessage into a provider-agnostic NormalizedMessage.
 * All Baileys-specific logic (JID normalization, message unwrapping, type detection,
 * content extraction, media download) lives here — not in MessageIngestService.
 */
import {
    type WAMessage,
    jidNormalizedUser,
    downloadMediaMessage,
} from '@whiskeysockets/baileys';
import type { NormalizedMessage, MessageType } from './types';
import { createLogger } from '../logger';

const log = createLogger('BaileysNormalizer');

/**
 * Normalize a raw Baileys WAMessage into a provider-agnostic NormalizedMessage.
 * Downloads media buffer if applicable so downstream services don't need Baileys.
 */
export async function normalizeWAMessage(botId: string, msg: WAMessage): Promise<NormalizedMessage | null> {
    const rawFrom = msg.key.remoteJid;
    if (!rawFrom || !msg.message) return null;

    // ── JID normalization + LID resolution ───────────────────────────────
    const normalizedRaw = jidNormalizedUser(rawFrom);
    let from = normalizedRaw;
    const keyWithAlt = msg.key as typeof msg.key & { remoteJidAlt?: string };
    if (from.includes('@lid') && keyWithAlt.remoteJidAlt) {
        from = jidNormalizedUser(keyWithAlt.remoteJidAlt);
    }
    const altFrom = from !== normalizedRaw ? normalizedRaw : undefined;

    // ── Unwrap view-once, ephemeral, document-with-caption wrappers ─────
    let m = msg.message as Record<string, any>;
    if (m.viewOnceMessage) m = m.viewOnceMessage.message;
    else if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
    else if (m.ephemeralMessage) m = m.ephemeralMessage.message;
    if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

    // Skip protocol messages (edits/deletes handled elsewhere)
    if (m.protocolMessage || m.senderKeyDistributionMessage) return null;

    // ── Type detection ──────────────────────────────────────────────────
    const type: MessageType =
        m.stickerMessage   ? 'STICKER' :
        m.reactionMessage  ? 'REACTION' :
        m.imageMessage     ? 'IMAGE' :
        m.videoMessage     ? 'VIDEO' :
        m.audioMessage     ? (m.audioMessage.ptt ? 'PTT' : 'AUDIO') :
        m.documentMessage  ? 'DOCUMENT' :
        m.contactMessage   ? 'CONTACT' :
        m.contactsArrayMessage ? 'CONTACT' :
        m.locationMessage  ? 'LOCATION' :
        m.liveLocationMessage ? 'LOCATION' :
        m.pollCreationMessage ? 'POLL' :
        'TEXT';

    // ── Content + metadata extraction ───────────────────────────────────
    let content = '';
    const metadata: Record<string, unknown> = {};

    switch (type) {
        case 'TEXT':
            content = m.conversation || m.extendedTextMessage?.text || '';
            break;
        case 'IMAGE':
            content = m.imageMessage?.caption || '';
            break;
        case 'VIDEO':
            content = m.videoMessage?.caption || '';
            break;
        case 'DOCUMENT':
            content = m.documentMessage?.caption || m.documentMessage?.fileName || '';
            break;
        case 'STICKER':
            content = '';
            metadata.animated = !!m.stickerMessage?.isAnimated;
            break;
        case 'REACTION':
            content = m.reactionMessage?.text || '';
            metadata.reactedTo = {
                id: m.reactionMessage?.key?.id,
                fromMe: m.reactionMessage?.key?.fromMe,
            };
            break;
        case 'CONTACT': {
            const single = m.contactMessage;
            const arr = m.contactsArrayMessage?.contacts;
            if (single) {
                content = single.displayName || '';
                metadata.vcard = single.vcard;
            } else if (arr) {
                content = arr.map((c: { displayName?: string }) => c.displayName).join(', ');
                metadata.contacts = arr.map((c: { displayName?: string; vcard?: string }) => ({ name: c.displayName, vcard: c.vcard }));
            }
            break;
        }
        case 'LOCATION': {
            const loc = m.locationMessage || m.liveLocationMessage;
            content = loc?.name || loc?.address || '';
            metadata.latitude = loc?.degreesLatitude;
            metadata.longitude = loc?.degreesLongitude;
            metadata.live = !!m.liveLocationMessage;
            break;
        }
        case 'POLL':
            content = m.pollCreationMessage?.name || '';
            metadata.options = m.pollCreationMessage?.options?.map((o: { optionName?: string }) => o.optionName) || [];
            break;
        default: // AUDIO, PTT
            content = '';
            break;
    }

    // ── Quoted message (reply context) ────────────────────────────────
    const contextSource = m.extendedTextMessage || m.imageMessage || m.videoMessage ||
        m.audioMessage || m.documentMessage || m.stickerMessage || m.contactMessage ||
        m.locationMessage || m.liveLocationMessage || m.pollCreationMessage;
    const contextInfo = contextSource?.contextInfo;
    if (contextInfo?.stanzaId) {
        const quotedMsg = contextInfo.quotedMessage;
        metadata.quotedMessage = {
            id: contextInfo.stanzaId,
            sender: contextInfo.participant || undefined,
            fromMe: contextInfo.participant ? false : true,
            content: quotedMsg?.conversation ||
                quotedMsg?.extendedTextMessage?.text ||
                quotedMsg?.imageMessage?.caption ||
                quotedMsg?.videoMessage?.caption ||
                quotedMsg?.documentMessage?.caption ||
                (quotedMsg?.stickerMessage ? '[Sticker]' : '') ||
                (quotedMsg?.audioMessage ? '[Audio]' : '') ||
                (quotedMsg?.contactMessage?.displayName ? `[Contacto: ${quotedMsg.contactMessage.displayName}]` : '') ||
                (quotedMsg?.locationMessage ? '[Ubicación]' : '') ||
                '',
        };
    }

    // ── Media download ──────────────────────────────────────────────────
    const hasMedia = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'PTT'].includes(type);
    let mediaBuffer: Buffer | undefined;
    let mediaFileName: string | undefined;
    let mediaMimeType: string | undefined;

    if (hasMedia) {
        // Extract filename and MIME from the Baileys message structure
        mediaFileName = m.documentMessage?.fileName;
        mediaMimeType =
            m.imageMessage?.mimetype || m.videoMessage?.mimetype ||
            m.audioMessage?.mimetype || m.documentMessage?.mimetype ||
            m.stickerMessage?.mimetype;

        try {
            const downloaded = await downloadMediaMessage(msg, 'buffer', {});
            if (downloaded) mediaBuffer = downloaded as Buffer;
        } catch (e) {
            log.warn(`Media download failed for ${msg.key.id}:`, (e as Error).message);
            // mediaBuffer stays undefined — ingest service will handle gracefully
        }
    }

    // ── Timestamp ───────────────────────────────────────────────────────
    let timestamp: Date | undefined;
    if (msg.messageTimestamp) {
        const ts = typeof msg.messageTimestamp === 'number'
            ? msg.messageTimestamp
            : Number(msg.messageTimestamp);
        timestamp = new Date(ts * 1000);
    }

    return {
        id: msg.key.id || `msg_${Date.now()}`,
        botId,
        from,
        fromMe: msg.key.fromMe || false,
        pushName: msg.pushName || undefined,
        altFrom,
        type,
        content,
        metadata,
        mediaBuffer,
        mediaFileName,
        mediaMimeType,
        timestamp,
    };
}
