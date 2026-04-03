import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock media download — normalizer calls this for media messages
vi.mock('./waba.service', () => ({
    downloadWABAMedia: vi.fn().mockResolvedValue(null),
}));

import { normalizeWABAWebhook } from './waba.normalizer';
import { downloadWABAMedia } from './waba.service';
import type { WABAWebhookPayload } from './waba.types';
import type { WABACredentials } from './waba.service';

const mockDownload = downloadWABAMedia as ReturnType<typeof vi.fn>;

const CREDS: WABACredentials = { accessToken: 'token', phoneNumberId: 'phone-123' };
const BOT_ID = 'bot-1';

/** Build a minimal valid WABA webhook payload. */
function webhook(messages: any[], contacts?: any[]): WABAWebhookPayload {
    return {
        object: 'whatsapp_business_account',
        entry: [{
            id: 'entry-1',
            changes: [{
                field: 'messages',
                value: {
                    messaging_product: 'whatsapp',
                    metadata: { display_phone_number: '+1234567890', phone_number_id: 'phone-123' },
                    contacts: contacts ?? [{ profile: { name: 'Test User' }, wa_id: '5491112345678' }],
                    messages,
                },
            }],
        }],
    };
}

describe('normalizeWABAWebhook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('normalizes a TEXT message', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.1', timestamp: '1711900000',
            type: 'text', text: { body: 'Hola!' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);

        expect(msg.type).toBe('TEXT');
        expect(msg.content).toBe('Hola!');
        expect(msg.from).toBe('5491112345678@s.whatsapp.net');
        expect(msg.fromMe).toBe(false);
        expect(msg.botId).toBe(BOT_ID);
        expect(msg.id).toBe('wamid.1');
    });

    it('extracts pushName from contact profile', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.2', timestamp: '1711900000',
            type: 'text', text: { body: 'Hi' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.pushName).toBe('Test User');
    });

    it('normalizes an IMAGE message with caption', async () => {
        mockDownload.mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' });

        const payload = webhook([{
            from: '5491112345678', id: 'wamid.3', timestamp: '1711900000',
            type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'My photo' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.type).toBe('IMAGE');
        expect(msg.content).toBe('My photo');
        expect(msg.mediaBuffer).toEqual(Buffer.from('img'));
        expect(msg.mediaMimeType).toBe('image/jpeg');
    });

    it('normalizes a VIDEO message', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.4', timestamp: '1711900000',
            type: 'video', video: { id: 'media-2', mime_type: 'video/mp4', caption: 'Check this' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.type).toBe('VIDEO');
        expect(msg.content).toBe('Check this');
    });

    it('normalizes an AUDIO message', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.5', timestamp: '1711900000',
            type: 'audio', audio: { id: 'media-3', mime_type: 'audio/ogg' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.type).toBe('AUDIO');
    });

    it('normalizes a DOCUMENT message with filename', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.6', timestamp: '1711900000',
            type: 'document', document: { id: 'media-4', mime_type: 'application/pdf', filename: 'file.pdf', caption: 'Report' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.type).toBe('DOCUMENT');
        expect(msg.content).toBe('Report');
        expect(msg.mediaFileName).toBe('file.pdf');
    });

    it('normalizes a REACTION message', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.7', timestamp: '1711900000',
            type: 'reaction', reaction: { message_id: 'target-1', emoji: '👍' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.type).toBe('REACTION');
        expect(msg.content).toBe('👍');
        expect(msg.metadata.reactionTargetId).toBe('target-1');
    });

    it('normalizes a LOCATION message', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.8', timestamp: '1711900000',
            type: 'location', location: { latitude: 19.43, longitude: -99.13, name: 'CDMX' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.type).toBe('LOCATION');
        expect(msg.content).toBe('CDMX');
        expect(msg.metadata.latitude).toBe(19.43);
        expect(msg.metadata.longitude).toBe(-99.13);
    });

    it('normalizes a CONTACT message', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.9', timestamp: '1711900000',
            type: 'contacts', contacts: [{ name: { formatted_name: 'Juan Pérez' } }],
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.type).toBe('CONTACT');
        expect(msg.content).toBe('Juan Pérez');
    });

    it('normalizes a STICKER message', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.10', timestamp: '1711900000',
            type: 'sticker', sticker: { id: 'media-5', mime_type: 'image/webp' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.type).toBe('STICKER');
    });

    it('skips unsupported message types', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.11', timestamp: '1711900000',
            type: 'order', order: { catalog_id: 'cat-1' },
        }]);

        const result = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(result).toHaveLength(0);
    });

    it('handles webhook with multiple messages', async () => {
        const payload = webhook([
            { from: '5491112345678', id: 'wamid.a', timestamp: '1711900000', type: 'text', text: { body: 'First' } },
            { from: '5491112345678', id: 'wamid.b', timestamp: '1711900001', type: 'text', text: { body: 'Second' } },
        ]);

        const result = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(result).toHaveLength(2);
        expect(result[0].content).toBe('First');
        expect(result[1].content).toBe('Second');
    });

    it('returns empty array for webhook without messages', async () => {
        const payload: WABAWebhookPayload = {
            object: 'whatsapp_business_account',
            entry: [{ id: 'entry-1', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '+1', phone_number_id: 'p1' } } as any }] }],
        };

        const result = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(result).toHaveLength(0);
    });

    it('parses timestamp from epoch seconds to Date', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.ts', timestamp: '1711900000',
            type: 'text', text: { body: 'time check' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.timestamp).toBeInstanceOf(Date);
        expect(msg.timestamp!.getTime()).toBe(1711900000 * 1000);
    });

    it('extracts context (quoted message) into metadata', async () => {
        const payload = webhook([{
            from: '5491112345678', id: 'wamid.ctx', timestamp: '1711900000',
            type: 'text', text: { body: 'reply' },
            context: { id: 'original-msg-id' },
        }]);

        const [msg] = await normalizeWABAWebhook(payload, BOT_ID, CREDS);
        expect(msg.metadata.quotedMessageId).toBe('original-msg-id');
    });
});
