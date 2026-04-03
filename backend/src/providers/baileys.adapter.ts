/**
 * Adapter that wraps the existing BaileysService as an IMessagingProvider.
 *
 * This is a thin delegation layer — all logic stays in BaileysService.
 * Once the codebase is fully migrated to the provider interface,
 * BaileysService internals can be refactored freely without touching consumers.
 */
import { BaileysService } from '../services/baileys.service';
import type { IMessagingProvider, ConnectionStatus, OutgoingPayload } from './types';

/**
 * Convert a provider-agnostic OutgoingPayload into Baileys' native content format.
 */
function toNativePayload(payload: OutgoingPayload, recipientJid: string): Record<string, unknown> {
    switch (payload.type) {
        case 'TEXT':
            return { text: payload.text, ...(payload.skipLinkPreview ? { skipLinkPreview: true } : {}) };
        case 'IMAGE':
            return { image: { url: payload.url }, caption: payload.caption || undefined };
        case 'VIDEO':
            return { video: { url: payload.url }, caption: payload.caption || undefined };
        case 'AUDIO':
            return {
                audio: { url: payload.url },
                ...(payload.ptt ? { ptt: true } : {}),
                ...(payload.mimetype ? { mimetype: payload.mimetype } : {}),
            };
        case 'DOCUMENT':
            return {
                document: { url: payload.url },
                caption: payload.caption || undefined,
                ...(payload.mimetype ? { mimetype: payload.mimetype } : {}),
                ...(payload.fileName ? { fileName: payload.fileName } : {}),
            };
        case 'REACTION':
            return {
                react: {
                    text: payload.emoji,
                    key: {
                        remoteJid: recipientJid,
                        id: payload.targetId,
                        fromMe: payload.targetFromMe,
                    },
                },
            };
        case 'REPLY':
            return {
                text: payload.text,
                contextInfo: {
                    stanzaId: payload.quotedId,
                    participant: payload.quotedSender,
                    quotedMessage: { conversation: payload.quotedText || '' },
                },
            };
    }
}

export const baileysProvider: IMessagingProvider = {
    async startSession(botId: string): Promise<void> {
        await BaileysService.startSession(botId);
    },

    stopSession: (botId) => BaileysService.stopSession(botId),

    shutdownAll: () => BaileysService.shutdownAll(),

    getStatus(botId: string): ConnectionStatus {
        const session = BaileysService.getSession(botId);
        const qr = BaileysService.getQR(botId);
        return {
            connected: !!session?.user,
            hasQr: !!qr,
            qr,
            user: session?.user ?? null,
        };
    },

    getQR: (botId) => BaileysService.getQR(botId) ?? null,

    requestPairingCode: (botId, phone) => BaileysService.requestPairingCode(botId, phone),

    sendMessage: (botId, to, payload) => BaileysService.sendMessage(botId, to, toNativePayload(payload, to)),

    markRead: (botId, chatId, messageIds) => BaileysService.markRead(botId, chatId, messageIds),

    sendPresence: (botId, chatId, presence) => BaileysService.sendPresence(botId, chatId, presence),

    syncLabels: (botId) => BaileysService.syncLabels(botId),

    addChatLabel: (botId, chatId, labelId) => BaileysService.addChatLabel(botId, chatId, labelId),

    removeChatLabel: (botId, chatId, labelId) => BaileysService.removeChatLabel(botId, chatId, labelId),

    markLabelEventHandled: (botId, sessionId, labelId, action) =>
        BaileysService.markLabelEventHandled(botId, sessionId, labelId, action),
};
