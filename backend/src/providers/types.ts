/**
 * Provider abstraction layer for multi-platform messaging.
 *
 * Every messaging platform (Baileys, WhatsApp Business API, Telegram, etc.)
 * implements this interface so the rest of the codebase stays platform-agnostic.
 */

// ── Normalized incoming message (provider-agnostic) ─────────────────────────

export type MessageType =
    | 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'PTT'
    | 'DOCUMENT' | 'STICKER' | 'REACTION'
    | 'CONTACT' | 'LOCATION' | 'POLL';

export interface NormalizedMessage {
    /** External message ID from the provider */
    id: string;
    /** Bot that received this message */
    botId: string;
    /** Normalized sender identifier (e.g. phone@s.whatsapp.net, or telegram user_id) */
    from: string;
    /** Whether this message was sent by us */
    fromMe: boolean;
    /** Display name of the sender (push name / contact name) */
    pushName?: string;
    /** Alternative identifier for session dedup (e.g. LID when primary is phone) */
    altFrom?: string;
    /** Message type */
    type: MessageType;
    /** Text content or caption */
    content: string;
    /** Extra type-specific metadata (reaction target, location coords, poll options, etc.) */
    metadata: Record<string, unknown>;
    /** Downloaded media binary — provider downloads it before passing to ingest */
    mediaBuffer?: Buffer;
    /** Original filename (for documents) */
    mediaFileName?: string;
    /** MIME type of the media */
    mediaMimeType?: string;
    /** Message timestamp */
    timestamp?: Date;
}

// ── Normalized outgoing payload (provider-agnostic) ────────────────────────

export type OutgoingPayload =
    | { type: 'TEXT'; text: string; skipLinkPreview?: boolean }
    | { type: 'IMAGE'; url: string; caption?: string }
    | { type: 'VIDEO'; url: string; caption?: string }
    | { type: 'AUDIO'; url: string; ptt?: boolean; mimetype?: string }
    | { type: 'DOCUMENT'; url: string; caption?: string; mimetype?: string; fileName?: string }
    | { type: 'REACTION'; emoji: string; targetId: string; targetSender: string; targetFromMe: boolean }
    | { type: 'REPLY'; text: string; quotedId: string; quotedSender: string; quotedText?: string };

// ── Connection status ───────────────────────────────────────────────────────

export interface ConnectionStatus {
    connected: boolean;
    hasQr: boolean;
    qr?: string | null;
    user?: Record<string, unknown> | null;
}

export interface IMessagingProvider {
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    startSession(botId: string): Promise<void>;
    stopSession(botId: string): Promise<void>;
    shutdownAll(): Promise<void>;

    // ── Connection info ──────────────────────────────────────────────────────
    getStatus(botId: string): ConnectionStatus;
    getQR(botId: string): string | null;
    requestPairingCode(botId: string, phoneNumber: string): Promise<string>;

    // ── Messaging ────────────────────────────────────────────────────────────
    sendMessage(botId: string, to: string, payload: OutgoingPayload): Promise<boolean>;
    markRead(botId: string, chatId: string, messageIds: string[]): Promise<void>;
    sendPresence(botId: string, chatId: string, presence: 'composing' | 'paused'): Promise<void>;

    // ── Labels (optional — not all providers support these) ──────────────────
    syncLabels(botId: string): Promise<void>;
    addChatLabel(botId: string, chatId: string, labelId: string): Promise<void>;
    removeChatLabel(botId: string, chatId: string, labelId: string): Promise<void>;
    markLabelEventHandled(botId: string, sessionId: string, labelId: string, action: 'add' | 'remove'): void;
}
