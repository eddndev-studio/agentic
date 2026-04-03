
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    type WASocket,
    jidNormalizedUser
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'node:https';
import { execSync } from 'node:child_process';
import QRCode from 'qrcode';
import { prisma } from './postgres.service';
import { BotConfigService } from './bot-config.service';
import { eventBus } from './event-bus';
import { generateLinkPreview } from './link-preview.service';
import pino from 'pino';
import { LabelService } from './label.service';
import { MessageIngestService, isMessageDuplicate } from './message-ingest.service';
import { upsertSessionFromChat, updateContactName } from './session-helpers';
import { config } from '../config';
import { createLogger } from '../logger';

const pinoLogger = pino({ level: 'silent' });
const log = createLogger('Baileys');

// Map to store active sockets: botId -> socket
const sessions = new Map<string, WASocket>();
// Map to store current QR codes: botId -> qrDataURL
const qrCodes = new Map<string, string>();
// Track reconnect attempts for exponential backoff
const reconnectAttempts = new Map<string, number>();
// Track reconnect timers so they can be cancelled on shutdown
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Signal Protocol auto-recovery: track decryption failures per bot
const decryptFailures = new Map<string, { count: number; lastPurge: number }>();

// ─── Watchdog: detect silent socket hangs (no events for extended period) ───
const watchdogTimers = new Map<string, ReturnType<typeof setTimeout>>();
const connectionTimestamps = new Map<string, number>(); // botId -> connectedAt ms

function resetWatchdog(botId: string): void {
    const existing = watchdogTimers.get(botId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        log.warn(`Watchdog: No messages for ${config.baileys.watchdogTimeout / 60000}min on Bot ${botId}, forcing reconnect`);
        watchdogTimers.delete(botId);
        const sock = sessions.get(botId);
        if (sock) {
            try { sock.ws.close(); } catch (e) { log.warn('watchdog ws.close error:', (e as Error).message); }
        }
    }, config.baileys.watchdogTimeout);

    watchdogTimers.set(botId, timer);
}

function stopWatchdog(botId: string): void {
    const timer = watchdogTimers.get(botId);
    if (timer) {
        clearTimeout(timer);
        watchdogTimers.delete(botId);
    }
}

// Simple CacheStore implementation for Baileys msgRetryCounterCache
class MapCacheStore {
    private cache = new Map<string, { value: unknown; expires: number }>();
    private ttl: number;
    constructor(ttlMs = 5 * 60 * 1000) { this.ttl = ttlMs; }
    get<T>(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expires) { this.cache.delete(key); return undefined; }
        return entry.value as T;
    }
    set<T>(key: string, value: T): void {
        this.cache.set(key, { value, expires: Date.now() + this.ttl });
    }
    del(key: string): void { this.cache.delete(key); }
    flushAll(): void { this.cache.clear(); }
}

let shuttingDown = false;

const AUTH_DIR = 'auth_info_baileys';

export class BaileysService {

    static async startSession(botId: string) {
        if (sessions.has(botId)) {
            return sessions.get(botId);
        }

        log.info(`Starting session for Bot ${botId}`);

        const sessionDir = path.join(AUTH_DIR, botId);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // ─── Credential recovery: restore from backup if creds.json is corrupted ───
        const credsPath = path.join(sessionDir, 'creds.json');
        const backupPath = path.join(sessionDir, 'creds.json.bak');
        if (fs.existsSync(credsPath)) {
            try {
                JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
            } catch {
                if (fs.existsSync(backupPath)) {
                    try {
                        JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
                        fs.copyFileSync(backupPath, credsPath);
                        log.warn(`Recovered corrupted creds.json from backup for Bot ${botId}`);
                    } catch {
                        log.error(`Both creds.json and backup are corrupted for Bot ${botId}`);
                    }
                }
            }
        }

        const { state, saveCreds: rawSaveCreds } = await useMultiFileAuthState(sessionDir);

        // Wrap saveCreds with backup-before-write logic
        const saveCreds = async () => {
            try {
                if (fs.existsSync(credsPath)) {
                    const content = fs.readFileSync(credsPath, 'utf-8');
                    JSON.parse(content); // validate current creds before backing up
                    fs.copyFileSync(credsPath, backupPath);
                }
            } catch {} // fire-and-forget: non-critical — skip backup if current creds are already invalid
            await rawSaveCreds();
        };

        const { version, isLatest } = await fetchLatestBaileysVersion();

        // Fetch bot config to check for IPv6 assignment
        const botConfig = await prisma.bot.findUnique({ where: { id: botId } });
        let socketAgent;

        if (botConfig?.ipv6Address) {
            // Check if the IPv6 address is actually available on this machine
            let isAvailable = await this.isAddressAvailable(botConfig.ipv6Address);
            if (!isAvailable) {
                // Auto-bind: try to add the address to eth0
                try {
                    execSync(`ip -6 addr add ${botConfig.ipv6Address}/64 dev eth0 2>/dev/null || true`);
                    isAvailable = await this.isAddressAvailable(botConfig.ipv6Address);
                    if (isAvailable) {
                        log.info(`Auto-bound IPv6 ${botConfig.ipv6Address} to eth0`);
                    }
                } catch (e) { log.warn('IPv6 auto-bind failed:', (e as Error).message); }
            }
            if (isAvailable) {
                log.info(`Bot ${botConfig.name} will bind to IPv6: ${botConfig.ipv6Address}`);
                socketAgent = new https.Agent({
                    localAddress: botConfig.ipv6Address,
                    family: 6,
                    keepAlive: true
                });
            } else {
                log.info(`IPv6 ${botConfig.ipv6Address} not available locally, using default network interface`);
            }
        }

        log.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        try {
            // @ts-ignore
            const sock = makeWASocket({
                version,
                logger: pinoLogger,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pinoLogger),
                },
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: false,
                qrTimeout: config.baileys.qrTimeout,
                // Enable automatic retry for failed message decryption (Bad MAC recovery)
                msgRetryCounterCache: new MapCacheStore(),
                // Custom Agent for IPv6 Binding
                ...(socketAgent && {
                    agent: socketAgent,
                    fetchAgent: socketAgent
                })
            });

            sessions.set(botId, sock);

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    log.info(`QR Received for Bot ${botId}`);
                    try {
                        const url = await QRCode.toDataURL(qr);
                        qrCodes.set(botId, url);
                        eventBus.emitBotEvent({ type: 'bot:qr', botId, qr: url });
                    } catch (err) {
                        log.error('QR Generation Error', err);
                    }
                }

                if (connection === 'close') {
                    const error = lastDisconnect?.error as Boom;
                    const statusCode = error?.output?.statusCode;

                    // Terminal states: don't reconnect
                    const terminalCodes = [
                        DisconnectReason.loggedOut,  // 401 — user logged out
                        408,                         // QR timeout
                    ];
                    const shouldReconnect = !terminalCodes.includes(statusCode!);

                    log.info(`Connection closed for Bot ${botId}. Code: ${statusCode}, Reconnecting: ${shouldReconnect}`);

                    sessions.delete(botId);
                    qrCodes.delete(botId);
                    stopWatchdog(botId);
                    connectionTimestamps.delete(botId);
                    LabelService.stopLabelReconciliation(botId);
                    eventBus.emitBotEvent({ type: 'bot:disconnected', botId, statusCode });

                    if (shouldReconnect && !shuttingDown) {
                        const attempt = reconnectAttempts.get(botId) || 0;
                        // Conflict (440) gets a longer base delay to avoid fight with other instance
                        const baseDelay = statusCode === 440 ? 10000 : 3000;
                        const maxDelay = 30000; // cap at 30s (was 120s — too many lost messages)
                        const exponential = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
                        // Add jitter (±25%) to prevent thundering herd
                        const jitter = exponential * (0.75 + Math.random() * 0.5);
                        const delay = Math.round(jitter);
                        reconnectAttempts.set(botId, attempt + 1);
                        log.info(`Reconnecting Bot ${botId} in ${delay / 1000}s (attempt ${attempt + 1})`);
                        const timer = setTimeout(() => {
                            reconnectTimers.delete(botId);
                            if (!shuttingDown) this.startSession(botId);
                        }, delay);
                        reconnectTimers.set(botId, timer);
                    } else {
                        reconnectAttempts.delete(botId);
                        log.info(`Bot ${botId} stopped (code ${statusCode}). No reconnect.`);
                    }
                } else if (connection === 'open') {
                    log.info(`Connection opened for Bot ${botId}`);
                    qrCodes.delete(botId);
                    reconnectAttempts.delete(botId); // Reset backoff on successful connection
                    connectionTimestamps.set(botId, Date.now());
                    resetWatchdog(botId);
                    eventBus.emitBotEvent({ type: 'bot:connected', botId, user: sock.user });

                    // Force full label sync — reuse syncLabels() which clears cache + version file
                    setTimeout(async () => {
                        try {
                            const s = sessions.get(botId);
                            if (s) await LabelService.syncLabels(s, botId);
                            log.info(`Full label sync completed for Bot ${botId}`);
                        } catch (e: unknown) {
                            log.warn(`Label sync failed for Bot ${botId}:`, (e as Error).message);
                        }

                        // Start periodic label reconciliation after initial sync
                        LabelService.startLabelReconciliation(botId, () => sessions.get(botId));
                    }, 5000);
                }
            });

            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                // Process both "notify" (real-time) and "append" (offline catch-up)
                if (type !== 'notify' && type !== 'append') return;

                // For "append" messages: only process if within grace period after connection
                const isAppend = type === 'append';
                if (isAppend) {
                    const connectedAt = connectionTimestamps.get(botId);
                    if (!connectedAt || Date.now() - connectedAt > config.baileys.appendGracePeriod) {
                        // Outside grace period — these are historical sync messages, skip
                        return;
                    }
                    log.info(`Processing ${messages.length} offline catch-up message(s) for Bot ${botId}`);
                }

                // Reset watchdog on any message activity
                resetWatchdog(botId);

                for (const msg of messages) {
                    try {
                        if (msg.key.remoteJid === 'status@broadcast') continue;

                        // Detect decryption failures (Bad MAC / corrupted Signal sessions)
                        if (!msg.message && msg.key.remoteJid) {
                            this.trackDecryptionFailure(botId);
                            continue;
                        }

                        if (!msg.message) continue;

                        // In-memory dedup: skip if already processed recently
                        const dedupKey = `${botId}:${msg.key.remoteJid}:${msg.key.id}`;
                        if (isMessageDuplicate(dedupKey)) {
                            log.info(`Dedup: skipping already-seen message ${msg.key.id}`);
                            continue;
                        }

                        // @ts-ignore
                        await MessageIngestService.handleIncomingMessage(botId, msg);
                    } catch (e) {
                        log.error(`Error in messages.upsert handler for msg ${msg.key.id}:`, e);
                    }
                }
            });

            sock.ev.on('labels.edit', async (label) => {
                await LabelService.handleLabelEdit(botId, label);
            });

            sock.ev.on('labels.association', async (event) => {
                await LabelService.handleLabelAssociation(botId, event, sock);
            });

            // --- presence.update: emit typing indicators to frontend ---
            sock.ev.on('presence.update', (update) => {
                try {
                    const jid = update.id;
                    if (!jid || jid.endsWith('@g.us')) return; // skip group presence
                    const presences = update.presences;
                    if (!presences) return;
                    for (const [participantJid, presence] of Object.entries(presences)) {
                        if (presence.lastKnownPresence === 'composing' || presence.lastKnownPresence === 'paused') {
                            eventBus.emitBotEvent({
                                type: 'session:typing',
                                botId,
                                identifier: jid,
                                typing: presence.lastKnownPresence === 'composing',
                            });
                        }
                    }
                } catch {}
            });

            // --- contacts.update: update session names when contacts change ---
            sock.ev.on('contacts.update', async (updates) => {
                for (const contact of updates) {
                    try {
                        await updateContactName(botId, contact);
                    } catch (e: unknown) {
                        log.warn('contacts.update error:', (e as Error).message);
                    }
                }
            });

            // --- contacts.upsert: initial sync delivers full contact objects ---
            sock.ev.on('contacts.upsert', async (contacts) => {
                for (const contact of contacts) {
                    try {
                        await updateContactName(botId, contact);
                    } catch (e: unknown) {
                        log.warn('contacts.upsert error:', (e as Error).message);
                    }
                }
            });

            // --- chats.upsert: create sessions for existing chats on reconnect ---
            sock.ev.on('chats.upsert', async (chats) => {
                const bot = await prisma.bot.findUnique({ where: { id: botId }, include: { template: true } });
                for (const chat of chats) {
                    try {
                        if (!chat.id || chat.id === 'status@broadcast') continue;
                        const jid = jidNormalizedUser(chat.id);
                        if (bot && BotConfigService.resolveExcludeGroups(bot) && jid.endsWith('@g.us')) continue;
                        const name = chat.name || (chat as Record<string, unknown>).subject as string || undefined;
                        const { session, created } = await upsertSessionFromChat(botId, jid, name);
                        if (created && session) {
                            eventBus.emitBotEvent({ type: 'session:created', botId, session });
                        }
                    } catch (e: unknown) {
                        log.warn('chats.upsert error:', (e as Error).message);
                    }
                }
            });

            // --- messaging-history.set: bulk import historical messages ---
            sock.ev.on('messaging-history.set', async (data) => {
                const { chats: histChats, contacts: histContacts, messages: histMessages } = data;
                const bot = await prisma.bot.findUnique({ where: { id: botId }, include: { template: true } });
                log.info(`History sync for Bot ${botId}: ${histChats?.length || 0} chats, ${histContacts?.length || 0} contacts, ${histMessages?.length || 0} messages`);

                // Upsert sessions from chats
                if (histChats?.length) {
                    for (const chat of histChats) {
                        try {
                            if (!chat.id || chat.id === 'status@broadcast') continue;
                            const jid = jidNormalizedUser(chat.id);
                            if (bot && BotConfigService.resolveExcludeGroups(bot) && jid.endsWith('@g.us')) continue;
                            await upsertSessionFromChat(botId, jid, chat.name || (chat as Record<string, unknown>).subject as string);
                        } catch (e) { log.warn('history chat upsert error:', (e as Error).message); }
                    }
                }

                // Update contact names
                if (histContacts?.length) {
                    for (const contact of histContacts) {
                        try {
                            await updateContactName(botId, contact);
                        } catch (e) { log.warn('history contact update error:', (e as Error).message); }
                    }
                }

                // Persist messages (isProcessed: true — MUST NOT trigger AI/flows)
                if (histMessages?.length) {
                    let imported = 0;
                    for (const msg of histMessages) {
                        try {
                            if (!msg.message || !msg.key?.remoteJid || msg.key.remoteJid === 'status@broadcast') continue;
                            const jid = jidNormalizedUser(msg.key.remoteJid);
                            if (bot && BotConfigService.resolveExcludeGroups(bot) && jid.endsWith('@g.us')) continue;

                            const session = await prisma.session.findUnique({
                                where: { botId_identifier: { botId, identifier: jid } },
                            });
                            if (!session) continue;

                            const externalId = msg.key.id;
                            if (!externalId) continue;

                            const content = msg.message.conversation ||
                                msg.message.extendedTextMessage?.text ||
                                msg.message.imageMessage?.caption ||
                                msg.message.videoMessage?.caption || '';

                            const msgType = msg.message.imageMessage ? 'IMAGE' :
                                msg.message.videoMessage ? 'VIDEO' :
                                msg.message.audioMessage ? 'AUDIO' :
                                msg.message.documentMessage ? 'DOCUMENT' : 'TEXT';

                            // Use original WhatsApp timestamp for correct ordering
                            const timestamp = msg.messageTimestamp
                                ? new Date(typeof msg.messageTimestamp === 'number'
                                    ? msg.messageTimestamp * 1000
                                    : Number(msg.messageTimestamp) * 1000)
                                : new Date();

                            await prisma.message.upsert({
                                where: { externalId },
                                update: {},
                                create: {
                                    externalId,
                                    sessionId: session.id,
                                    sender: jid,
                                    fromMe: msg.key.fromMe || false,
                                    content,
                                    type: msgType,
                                    isProcessed: true,
                                    createdAt: timestamp,
                                },
                            });
                            imported++;
                        } catch (e) { log.warn('history message import error:', (e as Error).message); }
                    }
                    log.info(`History sync imported ${imported} messages for Bot ${botId}`);
                }
            });

            // --- messages.update: handle edited messages ---
            sock.ev.on('messages.update', async (updates) => {
                for (const { key, update } of updates) {
                    try {
                        if (!key?.id) continue;

                        // Detect "delete for everyone" (messageStubType 1 = REVOKE)
                        if (update?.messageStubType === 1 || update?.messageStubType === 68) {
                            const { count } = await prisma.message.deleteMany({
                                where: { externalId: key.id },
                            });
                            if (count > 0) {
                                log.info(`Message ${key.id} revoked for Bot ${botId}`);
                                const jid = key.remoteJid;
                                if (jid) {
                                    let resolved = jidNormalizedUser(jid);
                                    if (resolved.endsWith('@lid')) {
                                        try {
                                            const pn = await (sock as any).signalRepository?.lidMapping?.getPNForLID(resolved);
                                            if (pn) resolved = jidNormalizedUser(pn);
                                        } catch (e) { log.warn('LID resolution failed in messages.update:', (e as Error).message); }
                                    }
                                    const identifier = resolved;
                                    const session = await prisma.session.findUnique({ where: { botId_identifier: { botId, identifier } } });
                                    if (session) {
                                        eventBus.emitBotEvent({ type: 'messages:deleted', botId, sessionId: session.id, count });
                                    }
                                }
                            }
                            continue;
                        }

                        const editedMessage = update?.message;
                        if (!editedMessage) continue;

                        const newContent = editedMessage.conversation ||
                            editedMessage.extendedTextMessage?.text ||
                            editedMessage.editedMessage?.message?.protocolMessage?.editedMessage?.conversation ||
                            editedMessage.editedMessage?.message?.protocolMessage?.editedMessage?.extendedTextMessage?.text;

                        if (!newContent) continue;

                        await prisma.message.updateMany({
                            where: { externalId: key.id },
                            data: { content: newContent },
                        });
                        log.info(`Message ${key.id} edited for Bot ${botId}`);
                    } catch (e: unknown) {
                        log.warn('messages.update error:', (e as Error).message);
                    }
                }
            });

            // Handle full chat deletion (client deletes entire chat)
            sock.ev.on('chats.delete', async (jids: string[]) => {
                for (const jid of jids) {
                    try {
                        // Resolve LID to normalized JID
                        let identifier = jidNormalizedUser(jid);
                        if (identifier.endsWith('@lid')) {
                            try {
                                const pn = await (sock as any).signalRepository?.lidMapping?.getPNForLID(identifier);
                                if (pn) identifier = jidNormalizedUser(pn);
                            } catch (e) { log.warn('LID resolution failed in chats.delete:', (e as Error).message); }
                        }
                        const session = await prisma.session.findUnique({
                            where: { botId_identifier: { botId, identifier } },
                        });
                        if (!session) continue;

                        const { count } = await prisma.message.deleteMany({
                            where: { sessionId: session.id },
                        });

                        const { ConversationService } = await import('./conversation.service');
                        await ConversationService.clear(session.id);

                        log.info(`Chat deleted for ${identifier} (Bot ${botId}): ${count} messages removed`);

                        eventBus.emitBotEvent({
                            type: 'messages:deleted',
                            botId,
                            sessionId: session.id,
                            count,
                        });
                    } catch (e: unknown) {
                        log.warn('chats.delete error:', (e as Error).message);
                    }
                }
            });

            // Handle message deletion (individual or chat clear)
            sock.ev.on('messages.delete', async (deletion) => {
                log.info(`messages.delete for Bot ${botId}:`, JSON.stringify(deletion).substring(0, 300));
                try {
                    // Helper: resolve LID to normalized JID (keeps @s.whatsapp.net suffix)
                    const resolveToIdentifier = async (jid: string): Promise<string> => {
                        let resolved = jidNormalizedUser(jid);
                        if (resolved.endsWith('@lid')) {
                            try {
                                const pn = await (sock as any).signalRepository?.lidMapping?.getPNForLID(resolved);
                                if (pn) resolved = jidNormalizedUser(pn);
                            } catch (e) { log.warn('LID resolution failed in messages.delete:', (e as Error).message); }
                        }
                        return resolved;
                    };

                    if ('all' in deletion && deletion.all) {
                        const jid = deletion.jid;
                        if (!jid) return;

                        const identifier = await resolveToIdentifier(jid);
                        const session = await prisma.session.findUnique({ where: { botId_identifier: { botId, identifier } } });
                        if (!session) return;

                        const { count } = await prisma.message.deleteMany({ where: { sessionId: session.id } });
                        const { ConversationService } = await import('./conversation.service');
                        await ConversationService.clear(session.id);

                        log.info(`Chat cleared for ${identifier} (Bot ${botId}): ${count} messages deleted`);
                        eventBus.emitBotEvent({ type: 'messages:deleted', botId, sessionId: session.id, count });

                    } else if ('keys' in deletion && deletion.keys?.length) {
                        // Group keys by resolved session
                        const keysBySession = new Map<string, string[]>();

                        for (const key of deletion.keys) {
                            if (!key.remoteJid) continue;
                            const identifier = await resolveToIdentifier(key.remoteJid);
                            if (!keysBySession.has(identifier)) keysBySession.set(identifier, []);
                            if (key.id) keysBySession.get(identifier)!.push(key.id);
                        }

                        for (const [identifier, externalIds] of keysBySession) {
                            const session = await prisma.session.findUnique({ where: { botId_identifier: { botId, identifier } } });
                            if (!session) continue;

                            const { count } = await prisma.message.deleteMany({
                                where: { sessionId: session.id, externalId: { in: externalIds } },
                            });

                            if (count > 0) {
                                log.info(`${count} message(s) deleted for ${identifier} (Bot ${botId})`);
                                eventBus.emitBotEvent({ type: 'messages:deleted', botId, sessionId: session.id, count });
                            }
                        }
                    }
                } catch (e: unknown) {
                    log.warn('messages.delete error:', (e as Error).message);
                }
            });

            return sock;

        } catch (error: unknown) {
            log.error(`Failed to start session for bot ${botId}:`, error);
            if (error instanceof Error && error.message?.includes('QR refs attempts ended')) {
                log.info(`QR timeout for bot ${botId}. Removing session to allow fresh retry.`);
                this.stopSession(botId);
            }
            return null;
        }
    }

    /**
     * Track decryption failures per bot. After config.baileys.decryptFailureThreshold failures,
     * purge Signal session files to force renegotiation (auto-recovery from Bad MAC).
     */
    private static trackDecryptionFailure(botId: string): void {
        const now = Date.now();
        const tracker = decryptFailures.get(botId) || { count: 0, lastPurge: 0 };

        tracker.count++;
        decryptFailures.set(botId, tracker);

        if (tracker.count >= config.baileys.decryptFailureThreshold && now - tracker.lastPurge > config.baileys.purgeCooldown) {
            this.purgeSignalSessions(botId);
            tracker.count = 0;
            tracker.lastPurge = now;
        }
    }

    /**
     * Delete corrupted Signal Protocol session files for a bot.
     * Preserves creds.json (no QR re-scan needed) and app-state files.
     * Sessions renegotiate automatically on the next message exchange.
     */
    static purgeSignalSessions(botId: string): void {
        const sessionDir = path.join(AUTH_DIR, botId);
        if (!fs.existsSync(sessionDir)) return;

        const files = fs.readdirSync(sessionDir);
        let purged = 0;

        for (const file of files) {
            if (file.startsWith('session-') || file.startsWith('sender-key-')) {
                try {
                    fs.unlinkSync(path.join(sessionDir, file));
                    purged++;
                } catch {} // fire-and-forget: non-critical
            }
        }

        if (purged > 0) {
            log.info(`Auto-purged ${purged} Signal session files for Bot ${botId} (Bad MAC recovery)`);
        }
    }

    static getQR(botId: string) {
        return qrCodes.get(botId);
    }

    static getSession(botId: string) {
        return sessions.get(botId);
    }

    static async requestPairingCode(botId: string, phoneNumber: string): Promise<string> {
        const sock = sessions.get(botId);
        if (!sock) throw new Error('Session not started');
        const normalized = phoneNumber.replace(/\D/g, '');
        if (normalized.length < 10 || normalized.length > 15) {
            throw new Error('Invalid phone number');
        }
        const code = await sock.requestPairingCode(normalized);
        return code;
    }

    static async stopSession(botId: string) {
        const sock = sessions.get(botId);
        if (sock) {
            try {
                await sock.logout();
            } catch (e) {
                log.error(`Error during logout for bot ${botId}:`, e);
            }
            sessions.delete(botId);
        }
        qrCodes.delete(botId);
        stopWatchdog(botId);
        connectionTimestamps.delete(botId);
        LabelService.stopLabelReconciliation(botId);

        // Optionally clear auth data to require new QR scan
        const sessionDir = path.join(AUTH_DIR, botId);
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            log.info(`Cleared auth data for bot ${botId}`);
        }

        log.info(`Session stopped for bot ${botId}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Baileys content can be text, image, audio, etc.
    static async sendMessage(botId: string, to: string, content: any): Promise<boolean> {
        // Intercept emulator sessions — don't send via WhatsApp
        if (to.startsWith('emu://')) {
            const externalId = `emu_sent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            // Persist outgoing message
            await MessageIngestService.persistOutgoingMessage(botId, to, externalId, content).catch(e => {
                log.warn('Emulator outgoing persistence error:', (e as Error).message);
            });
            return true;
        }

        const sock = sessions.get(botId);
        if (!sock) {
            log.warn(`sendMessage failed: Bot ${botId} not connected`);
            return false;
        }

        try {
            // Enrich text messages with explicit link preview (unless explicitly skipped)
            if (content?.text && !content.linkPreview && !content.skipLinkPreview) {
                const preview = await generateLinkPreview(content.text);
                if (preview) {
                    content = { ...content, linkPreview: preview };
                }
            }
            // Clean internal flag before sending to WhatsApp
            if (content?.skipLinkPreview) {
                const { skipLinkPreview: _, ...clean } = content;
                content = clean;
            }

            const sent = await sock.sendMessage(to, content);

            // Persist outgoing message to DB so it shows in the monitor
            if (sent?.key?.id) {
                MessageIngestService.persistOutgoingMessage(botId, to, sent.key.id, content).catch(e => {
                    log.warn('Outgoing message persistence error:', (e as Error).message);
                });
            }

            return true;
        } catch (error: unknown) {
            // Log the error with details but don't crash
            const errorCode = (error instanceof Error && 'code' in error ? (error as Record<string, unknown>).code : undefined) || 'UNKNOWN';
            const errorMsg = (error instanceof Error ? error.message : undefined) || String(error);
            log.error(`sendMessage failed for Bot ${botId} to ${to}:`, {
                code: errorCode,
                message: errorMsg,
                contentType: content?.text ? 'TEXT' : content?.image ? 'IMAGE' : content?.audio ? 'AUDIO' : 'OTHER'
            });

            // Rethrow so caller can handle/log, but with more context
            throw new Error(`Baileys send failed (${errorCode}): ${errorMsg}`);
        }
    }

    /**
     * Mark messages as read (blue ticks) for a chat.
     */
    static async markRead(botId: string, chatJid: string, messageIds: string[]): Promise<void> {
        if (chatJid.startsWith('emu://')) return; // No-op for emulator
        const sock = sessions.get(botId);
        if (!sock || messageIds.length === 0) return;
        try {
            const keys = messageIds.map(id => ({
                remoteJid: chatJid,
                id,
                fromMe: false,
                participant: undefined,
            }));
            await sock.readMessages(keys);
        } catch (e: unknown) {
            log.warn('markRead failed:', (e as Error).message);
        }
    }

    /**
     * Send presence update (typing / paused) for a chat.
     */
    static async sendPresence(botId: string, chatJid: string, presence: "composing" | "paused"): Promise<void> {
        if (chatJid.startsWith('emu://')) return; // No-op for emulator
        const sock = sessions.get(botId);
        if (!sock) return;
        try {
            await sock.sendPresenceUpdate(presence, chatJid);
        } catch (e: unknown) {
            log.warn(`sendPresence(${presence}) failed:`, (e as Error).message);
        }
    }

    // ─── Thin wrappers for backward compatibility (delegate to LabelService) ───

    static async syncLabels(botId: string): Promise<void> {
        const sock = sessions.get(botId);
        if (!sock) throw new Error(`Bot ${botId} not connected`);
        return LabelService.syncLabels(sock, botId);
    }

    static async addChatLabel(botId: string, chatJid: string, waLabelId: string): Promise<void> {
        if (chatJid.startsWith('emu://')) return; // No-op for emulator
        const sock = sessions.get(botId);
        if (!sock) throw new Error(`Bot ${botId} not connected`);
        return LabelService.addChatLabel(sock, botId, chatJid, waLabelId);
    }

    static async removeChatLabel(botId: string, chatJid: string, waLabelId: string): Promise<void> {
        if (chatJid.startsWith('emu://')) return; // No-op for emulator
        const sock = sessions.get(botId);
        if (!sock) throw new Error(`Bot ${botId} not connected`);
        return LabelService.removeChatLabel(sock, botId, chatJid, waLabelId);
    }

    static markLabelEventHandled(botId: string, sessionId: string, labelId: string, action: 'add' | 'remove'): void {
        LabelService.markLabelEventHandled(botId, sessionId, labelId, action);
    }

    /**
     * Graceful shutdown: cancel all reconnect timers and close all sockets.
     */
    static async shutdownAll(): Promise<void> {
        shuttingDown = true;

        // Cancel all label reconciliation timers
        LabelService.stopAllReconciliation();

        // Cancel all watchdog timers
        for (const [botId] of watchdogTimers) {
            stopWatchdog(botId);
        }
        connectionTimestamps.clear();

        // Cancel all pending reconnect timers
        for (const [botId, timer] of reconnectTimers) {
            clearTimeout(timer);
            log.info(`Cancelled reconnect timer for Bot ${botId}`);
        }
        reconnectTimers.clear();
        reconnectAttempts.clear();

        // Close all active sockets (without deleting auth — not a logout)
        for (const [botId, sock] of sessions) {
            try {
                sock.ws.close();
                log.info(`Closed socket for Bot ${botId}`);
            } catch (e: unknown) {
                log.warn(`Error closing socket for Bot ${botId}:`, (e as Error).message);
            }
        }
        sessions.clear();
        qrCodes.clear();
    }

    /**
     * Check if a local address is available for binding.
     * Compares against OS network interfaces.
     */
    private static async isAddressAvailable(address: string): Promise<boolean> {
        const { networkInterfaces } = await import('os');
        const nets = networkInterfaces();
        for (const ifaces of Object.values(nets)) {
            if (!ifaces) continue;
            for (const iface of ifaces) {
                if (iface.address === address) return true;
            }
        }
        return false;
    }
}
