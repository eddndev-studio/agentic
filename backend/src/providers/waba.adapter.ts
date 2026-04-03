/**
 * WhatsApp Cloud API (WABA) provider — implements IMessagingProvider.
 *
 * Unlike Baileys, WABA is stateless: no persistent socket connections.
 * Auth is token-based (per-bot credentials), no QR codes.
 * Incoming messages arrive via Meta webhooks.
 */
import { createLogger } from '../logger';
import { sendWABAMessage, markWABARead, getWABACredentials, clearWABACredentialsCache } from './waba.service';
import { MessageIngestService } from '../services/message-ingest.service';
import { normalizeWABAWebhook } from './waba.normalizer';
import type { IMessagingProvider, ConnectionStatus, OutgoingPayload } from './types';
import type { WABAWebhookPayload } from './waba.types';

const log = createLogger('WABA-Provider');

export const wabaProvider: IMessagingProvider = {
    // ── Lifecycle ────────────────────────────────────────────────────────────
    // WABA is stateless — no persistent connections to manage.

    async startSession(botId: string): Promise<void> {
        try {
            const creds = await getWABACredentials(botId);
            log.info(`Session ready for bot ${botId} (phone: ${creds.phoneNumberId})`);
        } catch (err) {
            log.warn(`Cannot start WABA session for ${botId}: ${(err as Error).message}`);
        }
    },

    async stopSession(botId: string): Promise<void> {
        clearWABACredentialsCache(botId);
    },

    async shutdownAll(): Promise<void> {
        clearWABACredentialsCache();
    },

    // ── Connection info ──────────────────────────────────────────────────────

    getStatus(_botId: string): ConnectionStatus {
        return {
            connected: true, // WABA is stateless — always "connected" if credentials exist
            hasQr: false,
            qr: null,
        };
    },

    getQR(_botId: string): string | null {
        return null; // WABA doesn't use QR codes
    },

    async requestPairingCode(_botId: string, _phone: string): Promise<string> {
        throw new Error('WABA does not support pairing codes — use access token authentication');
    },

    // ── Messaging ────────────────────────────────────────────────────────────

    async sendMessage(botId: string, to: string, payload: OutgoingPayload): Promise<boolean> {
        const creds = await getWABACredentials(botId);
        // Strip @s.whatsapp.net suffix if present — WABA expects plain phone numbers
        const phone = to.replace(/@s\.whatsapp\.net$/, '');
        const messageId = await sendWABAMessage(creds, phone, payload);

        if (messageId) {
            // Persist outgoing message
            const textContent = 'text' in payload ? payload.text : ('caption' in payload ? (payload as any).caption : '') || '';
            const msgType = payload.type === 'REPLY' ? 'TEXT' : payload.type;
            await MessageIngestService.persistOutgoingMessage(
                botId, to, messageId, msgType, textContent,
            );
        }

        return !!messageId;
    },

    async markRead(botId: string, _chatId: string, messageIds: string[]): Promise<void> {
        const creds = await getWABACredentials(botId);
        // WABA only marks one message at a time
        for (const id of messageIds) {
            await markWABARead(creds, id);
        }
    },

    async sendPresence(_botId: string, _chatId: string, _presence: 'composing' | 'paused'): Promise<void> {
        // WABA Cloud API doesn't support typing indicators
    },

    // ── Labels ───────────────────────────────────────────────────────────────
    // WABA Cloud API doesn't support label management.

    async syncLabels(_botId: string): Promise<void> {},
    async addChatLabel(_botId: string, _chatId: string, _labelId: string): Promise<void> {},
    async removeChatLabel(_botId: string, _chatId: string, _labelId: string): Promise<void> {},
    markLabelEventHandled(_botId: string, _sessionId: string, _labelId: string, _action: 'add' | 'remove'): void {},
};

/**
 * Process an incoming WABA webhook delivery.
 * Called from the webhook controller after signature verification.
 */
export async function handleWABAWebhook(botId: string, payload: WABAWebhookPayload): Promise<void> {
    const creds = await getWABACredentials(botId);
    const messages = await normalizeWABAWebhook(payload, botId, creds);

    for (const msg of messages) {
        try {
            await MessageIngestService.handleIncomingMessage(msg);
        } catch (err) {
            log.error(`Failed to ingest WABA message ${msg.id}:`, err);
        }
    }
}
