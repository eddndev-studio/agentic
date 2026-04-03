/**
 * WhatsApp Cloud API (WABA) provider — implements IMessagingProvider.
 *
 * Unlike Baileys, WABA is stateless: no persistent socket connections.
 * Auth is token-based (per-bot credentials), no QR codes.
 * Incoming messages arrive via Meta webhooks.
 */
import { prisma } from '../services/postgres.service';
import { safeParseBotCredentials } from '../schemas';
import { createLogger } from '../logger';
import { sendWABAMessage, markWABARead, type WABACredentials } from './waba.service';
import { MessageIngestService } from '../services/message-ingest.service';
import { normalizeWABAWebhook } from './waba.normalizer';
import type { IMessagingProvider, ConnectionStatus, OutgoingPayload } from './types';
import type { WABAWebhookPayload } from './waba.types';

const log = createLogger('WABA-Provider');

// Cache: botId → credentials (avoid repeated DB lookups)
const credentialsCache = new Map<string, { creds: WABACredentials; expiresAt: number }>();
const CREDS_CACHE_TTL = 60_000; // 1 minute

async function getCredentials(botId: string): Promise<WABACredentials> {
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

export const wabaProvider: IMessagingProvider = {
    // ── Lifecycle ────────────────────────────────────────────────────────────
    // WABA is stateless — no persistent connections to manage.

    async startSession(botId: string): Promise<void> {
        try {
            const creds = await getCredentials(botId);
            log.info(`Session ready for bot ${botId} (phone: ${creds.phoneNumberId})`);
        } catch (err) {
            log.warn(`Cannot start WABA session for ${botId}: ${(err as Error).message}`);
        }
    },

    async stopSession(_botId: string): Promise<void> {
        credentialsCache.delete(_botId);
    },

    async shutdownAll(): Promise<void> {
        credentialsCache.clear();
    },

    // ── Connection info ──────────────────────────────────────────────────────

    getStatus(botId: string): ConnectionStatus {
        const cached = credentialsCache.get(botId);
        return {
            connected: !!cached,
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
        const creds = await getCredentials(botId);
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
        const creds = await getCredentials(botId);
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
    const creds = await getCredentials(botId);
    const messages = await normalizeWABAWebhook(payload, botId, creds);

    for (const msg of messages) {
        try {
            await MessageIngestService.handleIncomingMessage(msg);
        } catch (err) {
            log.error(`Failed to ingest WABA message ${msg.id}:`, err);
        }
    }
}
