/**
 * Adapter that wraps the existing BaileysService as an IMessagingProvider.
 *
 * This is a thin delegation layer — all logic stays in BaileysService.
 * Once the codebase is fully migrated to the provider interface,
 * BaileysService internals can be refactored freely without touching consumers.
 */
import { BaileysService } from '../services/baileys.service';
import type { IMessagingProvider, ConnectionStatus } from './types';

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

    sendMessage: (botId, to, content) => BaileysService.sendMessage(botId, to, content),

    markRead: (botId, chatId, messageIds) => BaileysService.markRead(botId, chatId, messageIds),

    sendPresence: (botId, chatId, presence) => BaileysService.sendPresence(botId, chatId, presence),

    syncLabels: (botId) => BaileysService.syncLabels(botId),

    addChatLabel: (botId, chatId, labelId) => BaileysService.addChatLabel(botId, chatId, labelId),

    removeChatLabel: (botId, chatId, labelId) => BaileysService.removeChatLabel(botId, chatId, labelId),

    markLabelEventHandled: (botId, sessionId, labelId, action) =>
        BaileysService.markLabelEventHandled(botId, sessionId, labelId, action),
};
