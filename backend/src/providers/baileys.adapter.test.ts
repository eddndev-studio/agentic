import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BaileysService — the adapter is a thin delegation layer
vi.mock('../services/baileys.service', () => ({
    BaileysService: {
        startSession: vi.fn(),
        stopSession: vi.fn(),
        shutdownAll: vi.fn(),
        getSession: vi.fn(),
        getQR: vi.fn(),
        requestPairingCode: vi.fn(),
        sendMessage: vi.fn().mockResolvedValue(true),
        markRead: vi.fn(),
        sendPresence: vi.fn(),
        syncLabels: vi.fn(),
        addChatLabel: vi.fn(),
        removeChatLabel: vi.fn(),
        markLabelEventHandled: vi.fn(),
    },
}));

import { baileysProvider } from './baileys.adapter';
import { BaileysService } from '../services/baileys.service';
import type { OutgoingPayload } from './types';

const mockService = BaileysService as any;

describe('baileysProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Payload translation ─────────────────────────────────────────────────

    it('sendMessage() translates TEXT payload to Baileys format', async () => {
        await baileysProvider.sendMessage('bot-1', 'jid@s.whatsapp.net', { type: 'TEXT', text: 'Hello' });

        expect(mockService.sendMessage).toHaveBeenCalledWith(
            'bot-1', 'jid@s.whatsapp.net', { text: 'Hello' },
        );
    });

    it('sendMessage() translates IMAGE payload', async () => {
        const payload: OutgoingPayload = { type: 'IMAGE', url: 'https://img.com/a.jpg', caption: 'Photo' };
        await baileysProvider.sendMessage('bot-1', 'jid@s.whatsapp.net', payload);

        expect(mockService.sendMessage).toHaveBeenCalledWith(
            'bot-1', 'jid@s.whatsapp.net',
            { image: { url: 'https://img.com/a.jpg' }, caption: 'Photo' },
        );
    });

    it('sendMessage() translates VIDEO payload', async () => {
        const payload: OutgoingPayload = { type: 'VIDEO', url: 'https://vid.com/v.mp4', caption: 'Watch' };
        await baileysProvider.sendMessage('bot-1', 'jid@s.whatsapp.net', payload);

        expect(mockService.sendMessage).toHaveBeenCalledWith(
            'bot-1', 'jid@s.whatsapp.net',
            { video: { url: 'https://vid.com/v.mp4' }, caption: 'Watch' },
        );
    });

    it('sendMessage() translates AUDIO payload with ptt', async () => {
        const payload: OutgoingPayload = { type: 'AUDIO', url: 'https://aud.com/a.ogg', ptt: true };
        await baileysProvider.sendMessage('bot-1', 'jid@s.whatsapp.net', payload);

        expect(mockService.sendMessage).toHaveBeenCalledWith(
            'bot-1', 'jid@s.whatsapp.net',
            { audio: { url: 'https://aud.com/a.ogg' }, ptt: true },
        );
    });

    it('sendMessage() translates DOCUMENT payload', async () => {
        const payload: OutgoingPayload = { type: 'DOCUMENT', url: 'https://d.com/f.pdf', fileName: 'report.pdf' };
        await baileysProvider.sendMessage('bot-1', 'jid@s.whatsapp.net', payload);

        expect(mockService.sendMessage).toHaveBeenCalledWith(
            'bot-1', 'jid@s.whatsapp.net',
            { document: { url: 'https://d.com/f.pdf' }, caption: undefined, fileName: 'report.pdf' },
        );
    });

    it('sendMessage() translates REACTION payload', async () => {
        const payload: OutgoingPayload = {
            type: 'REACTION', emoji: '👍',
            targetId: 'msg-1', targetSender: 'jid@s.whatsapp.net', targetFromMe: false,
        };
        await baileysProvider.sendMessage('bot-1', 'jid@s.whatsapp.net', payload);

        expect(mockService.sendMessage).toHaveBeenCalledWith(
            'bot-1', 'jid@s.whatsapp.net',
            {
                react: {
                    text: '👍',
                    key: { remoteJid: 'jid@s.whatsapp.net', id: 'msg-1', fromMe: false },
                },
            },
        );
    });

    it('sendMessage() translates REPLY payload', async () => {
        const payload: OutgoingPayload = {
            type: 'REPLY', text: 'My reply',
            quotedId: 'msg-q', quotedSender: 'sender@s.whatsapp.net', quotedText: 'Original',
        };
        await baileysProvider.sendMessage('bot-1', 'jid@s.whatsapp.net', payload);

        expect(mockService.sendMessage).toHaveBeenCalledWith(
            'bot-1', 'jid@s.whatsapp.net',
            {
                text: 'My reply',
                contextInfo: {
                    stanzaId: 'msg-q',
                    participant: 'sender@s.whatsapp.net',
                    quotedMessage: { conversation: 'Original' },
                },
            },
        );
    });

    // ── Delegation ──────────────────────────────────────────────────────────

    it('getQR() delegates to BaileysService.getQR', () => {
        mockService.getQR.mockReturnValue('data:image/png;base64,qr...');
        expect(baileysProvider.getQR('bot-1')).toBe('data:image/png;base64,qr...');
    });

    it('getQR() returns null when no QR available', () => {
        mockService.getQR.mockReturnValue(undefined);
        expect(baileysProvider.getQR('bot-1')).toBeNull();
    });

    it('getStatus() returns connected and hasQr from session state', () => {
        mockService.getSession.mockReturnValue({ user: { id: '123' } });
        mockService.getQR.mockReturnValue(null);

        const status = baileysProvider.getStatus('bot-1');
        expect(status.connected).toBe(true);
        expect(status.hasQr).toBe(false);
        expect(status.user).toEqual({ id: '123' });
    });

    it('syncLabels delegates to BaileysService', async () => {
        await baileysProvider.syncLabels('bot-1');
        expect(mockService.syncLabels).toHaveBeenCalledWith('bot-1');
    });

    it('addChatLabel delegates to BaileysService', async () => {
        await baileysProvider.addChatLabel('bot-1', 'chat-1', 'label-1');
        expect(mockService.addChatLabel).toHaveBeenCalledWith('bot-1', 'chat-1', 'label-1');
    });
});
