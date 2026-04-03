import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('./waba.service', () => ({
    sendWABAMessage: vi.fn(),
    markWABARead: vi.fn(),
    getWABACredentials: vi.fn().mockResolvedValue({ accessToken: 'tok', phoneNumberId: 'pn-1' }),
    clearWABACredentialsCache: vi.fn(),
}));

vi.mock('../services/message-ingest.service', () => ({
    MessageIngestService: {
        persistOutgoingMessage: vi.fn(),
    },
}));

vi.mock('./waba.normalizer', () => ({
    normalizeWABAWebhook: vi.fn().mockResolvedValue([]),
}));

vi.mock('./waba.types', () => ({}));

import { wabaProvider } from './waba.adapter';
import { sendWABAMessage, markWABARead, getWABACredentials, clearWABACredentialsCache } from './waba.service';
import { MessageIngestService } from '../services/message-ingest.service';
import type { OutgoingPayload } from './types';

const mockSend = sendWABAMessage as ReturnType<typeof vi.fn>;
const mockMarkRead = markWABARead as ReturnType<typeof vi.fn>;
const mockGetCreds = getWABACredentials as ReturnType<typeof vi.fn>;
const mockClearCache = clearWABACredentialsCache as ReturnType<typeof vi.fn>;
const mockPersist = MessageIngestService.persistOutgoingMessage as ReturnType<typeof vi.fn>;

describe('wabaProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetCreds.mockResolvedValue({ accessToken: 'tok', phoneNumberId: 'pn-1' });
    });

    // ── Messaging ───────────────────────────────────────────────────────────

    it('sendMessage() strips @s.whatsapp.net and calls sendWABAMessage', async () => {
        mockSend.mockResolvedValue('wamid.sent-1');

        const payload: OutgoingPayload = { type: 'TEXT', text: 'Hello' };
        const result = await wabaProvider.sendMessage('bot-1', '5491112345678@s.whatsapp.net', payload);

        expect(result).toBe(true);
        expect(mockSend).toHaveBeenCalledWith(
            { accessToken: 'tok', phoneNumberId: 'pn-1' },
            '5491112345678',
            payload,
        );
    });

    it('sendMessage() persists outgoing message on success', async () => {
        mockSend.mockResolvedValue('wamid.sent-2');

        await wabaProvider.sendMessage('bot-1', '123@s.whatsapp.net', { type: 'TEXT', text: 'Hi' });

        expect(mockPersist).toHaveBeenCalledWith(
            'bot-1', '123@s.whatsapp.net', 'wamid.sent-2', 'TEXT', 'Hi',
        );
    });

    it('sendMessage() returns false when send fails', async () => {
        mockSend.mockResolvedValue(null);

        const result = await wabaProvider.sendMessage('bot-1', '123@s.whatsapp.net', { type: 'TEXT', text: 'fail' });
        expect(result).toBe(false);
        expect(mockPersist).not.toHaveBeenCalled();
    });

    it('markRead() calls markWABARead for each message ID', async () => {
        await wabaProvider.markRead('bot-1', 'chat-1', ['msg-1', 'msg-2']);

        expect(mockMarkRead).toHaveBeenCalledTimes(2);
        expect(mockMarkRead).toHaveBeenCalledWith({ accessToken: 'tok', phoneNumberId: 'pn-1' }, 'msg-1');
        expect(mockMarkRead).toHaveBeenCalledWith({ accessToken: 'tok', phoneNumberId: 'pn-1' }, 'msg-2');
    });

    it('sendPresence() is a no-op', async () => {
        // Should not throw
        await wabaProvider.sendPresence('bot-1', 'chat-1', 'composing');
    });

    // ── Connection / Auth ───────────────────────────────────────────────────

    it('getQR() always returns null', () => {
        expect(wabaProvider.getQR('bot-1')).toBeNull();
    });

    it('requestPairingCode() always throws', async () => {
        await expect(wabaProvider.requestPairingCode('bot-1', '+1234567890'))
            .rejects.toThrow('WABA does not support pairing codes');
    });

    it('getStatus() returns connected without QR', () => {
        const status = wabaProvider.getStatus('bot-1');
        expect(status.hasQr).toBe(false);
        expect(status.qr).toBeNull();
    });

    // ── Lifecycle ───────────────────────────────────────────────────────────

    it('stopSession() clears credentials cache', async () => {
        await wabaProvider.stopSession('bot-1');
        expect(mockClearCache).toHaveBeenCalledWith('bot-1');
    });

    it('shutdownAll() clears all credentials cache', async () => {
        await wabaProvider.shutdownAll();
        expect(mockClearCache).toHaveBeenCalledWith();
    });

    // ── Labels (no-op for WABA) ─────────────────────────────────────────────

    it('label methods are no-ops', async () => {
        await wabaProvider.syncLabels('bot-1');
        await wabaProvider.addChatLabel('bot-1', 'chat-1', 'label-1');
        await wabaProvider.removeChatLabel('bot-1', 'chat-1', 'label-1');
        wabaProvider.markLabelEventHandled('bot-1', 'session-1', 'label-1', 'add');
        // No errors thrown — all silently succeed
    });
});
