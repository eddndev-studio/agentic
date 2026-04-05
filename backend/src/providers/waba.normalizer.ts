/**
 * Normalize a WABA webhook payload into provider-agnostic NormalizedMessage(s).
 * All Cloud API-specific logic lives here.
 */
import { createLogger } from '../logger';
import { downloadWABAMedia, type WABACredentials } from './waba.service';
import type { NormalizedMessage, MessageType } from './types';
import type { WABAWebhookPayload, WABAMessage, WABAChangeValue } from './waba.types';

const log = createLogger('WABA-Normalizer');

/**
 * Extract all NormalizedMessages from a single WABA webhook delivery.
 * A single webhook POST can contain multiple messages across multiple entries.
 */
export async function normalizeWABAWebhook(
    payload: WABAWebhookPayload,
    botId: string,
    creds: WABACredentials,
): Promise<NormalizedMessage[]> {
    const results: NormalizedMessage[] = [];

    for (const entry of payload.entry) {
        for (const change of entry.changes) {
            if (change.field !== 'messages') continue;
            const value = change.value;
            if (!value.messages) continue;

            for (const msg of value.messages) {
                try {
                    const normalized = await normalizeMessage(msg, value, botId, creds);
                    if (normalized) results.push(normalized);
                } catch (err) {
                    log.error(`Failed to normalize message ${msg.id}:`, err);
                }
            }
        }
    }

    return results;
}

async function normalizeMessage(
    msg: WABAMessage,
    value: WABAChangeValue,
    botId: string,
    creds: WABACredentials,
): Promise<NormalizedMessage | null> {
    const type = detectType(msg);
    if (!type) {
        log.info(`Skipping unsupported WABA message type: ${msg.type}`);
        return null;
    }

    // Resolve sender info
    const contact = value.contacts?.find(c => c.wa_id === msg.from);
    const pushName = contact?.profile?.name;
    // Normalize to @s.whatsapp.net format for consistency with Baileys sessions
    const from = `${msg.from}@s.whatsapp.net`;

    // Extract content
    const content = extractContent(msg, type);

    // Extract metadata
    const metadata: Record<string, unknown> = {};
    if (msg.context?.id) {
        metadata.quotedMessage = {
            id: msg.context.id,
            sender: msg.context.from || undefined,
            fromMe: false,
            content: '',
        };
    }
    if (type === 'REACTION' && msg.reaction) {
        metadata.reactedTo = { id: msg.reaction.message_id };
    }
    if (type === 'LOCATION' && msg.location) {
        metadata.latitude = msg.location.latitude;
        metadata.longitude = msg.location.longitude;
        metadata.locationName = msg.location.name;
        metadata.locationAddress = msg.location.address;
    }

    // Download media if applicable
    let mediaBuffer: Buffer | undefined;
    let mediaMimeType: string | undefined;
    let mediaFileName: string | undefined;

    const mediaInfo = msg.image || msg.video || msg.audio || msg.document || msg.sticker;
    if (mediaInfo) {
        const result = await downloadWABAMedia(creds, mediaInfo.id);
        if (result) {
            mediaBuffer = result.buffer;
            mediaMimeType = result.mimeType;
        }
        if (msg.document?.filename) {
            mediaFileName = msg.document.filename;
        }
        if (mediaInfo.mime_type) {
            mediaMimeType = mediaInfo.mime_type;
        }
    }

    return {
        id: msg.id,
        botId,
        from,
        fromMe: false,
        pushName,
        type,
        content,
        metadata,
        mediaBuffer,
        mediaMimeType,
        mediaFileName,
        timestamp: new Date(parseInt(msg.timestamp) * 1000),
    };
}

function detectType(msg: WABAMessage): MessageType | null {
    switch (msg.type) {
        case 'text':        return 'TEXT';
        case 'image':       return 'IMAGE';
        case 'video':       return 'VIDEO';
        case 'audio':       return 'AUDIO';
        case 'document':    return 'DOCUMENT';
        case 'sticker':     return 'STICKER';
        case 'reaction':    return 'REACTION';
        case 'location':    return 'LOCATION';
        case 'contacts':    return 'CONTACT';
        default:            return null;
    }
}

function extractContent(msg: WABAMessage, type: MessageType): string {
    switch (type) {
        case 'TEXT':
            return msg.text?.body || '';
        case 'IMAGE':
            return msg.image?.caption || '';
        case 'VIDEO':
            return msg.video?.caption || '';
        case 'DOCUMENT':
            return msg.document?.caption || '';
        case 'REACTION':
            return msg.reaction?.emoji || '';
        case 'LOCATION':
            return msg.location?.name || msg.location?.address || '';
        case 'CONTACT':
            return msg.contacts?.map(c => c.name.formatted_name).join(', ') || '';
        default:
            return '';
    }
}
