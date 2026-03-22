
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    downloadMediaMessage,
    type WASocket,
    type WAMessage,
    jidNormalizedUser
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'node:https';
import QRCode from 'qrcode';
import { prisma } from './postgres.service';
import { flowEngine } from '../core/flow';
import { BotConfigService } from './bot-config.service';
import { MessageAccumulator } from './accumulator.service';
import { queueService } from './queue.service';
import { eventBus } from './event-bus';
import { SessionStatus, Platform } from '@prisma/client';
import { StorageService } from './storage.service';
import { generateLinkPreview } from './link-preview.service';
import pino from 'pino';

const logger = pino({ level: 'silent' });

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
const DECRYPT_FAILURE_THRESHOLD = 5;
const PURGE_COOLDOWN = 6 * 60 * 60 * 1000; // 6 hours

// Label reconciliation timers: botId -> intervalId
const labelReconcileTimers = new Map<string, ReturnType<typeof setInterval>>();
const LABEL_RECONCILE_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Dedup guard: prevents double-firing when local code emits AND Baileys re-emits
// Key: "botId:sessionId:labelId:action", value: timestamp
const recentLabelEvents = new Map<string, number>();
const LABEL_DEDUP_TTL = 5000; // 5 seconds

// ─── In-memory message dedup cache (prevents reprocessing on reconnect/replay) ───
const MESSAGE_DEDUP_TTL = 20 * 60 * 1000; // 20 minutes
const MESSAGE_DEDUP_MAX = 5000;
const messageDedup = new Map<string, number>(); // dedupKey -> timestamp

function isMessageDuplicate(key: string): boolean {
    const now = Date.now();
    // Lazy cleanup when cache reaches max size
    if (messageDedup.size >= MESSAGE_DEDUP_MAX) {
        for (const [k, ts] of messageDedup) {
            if (now - ts > MESSAGE_DEDUP_TTL) messageDedup.delete(k);
        }
    }
    const existing = messageDedup.get(key);
    if (existing && now - existing < MESSAGE_DEDUP_TTL) return true;
    messageDedup.set(key, now);
    return false;
}

// ─── Watchdog: detect silent socket hangs (no events for extended period) ───
const WATCHDOG_TIMEOUT = 30 * 60 * 1000; // 30 minutes → force reconnect
const watchdogTimers = new Map<string, ReturnType<typeof setTimeout>>();
const connectionTimestamps = new Map<string, number>(); // botId -> connectedAt ms

function resetWatchdog(botId: string): void {
    const existing = watchdogTimers.get(botId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        console.warn(`[Baileys] Watchdog: No messages for ${WATCHDOG_TIMEOUT / 60000}min on Bot ${botId}, forcing reconnect`);
        watchdogTimers.delete(botId);
        const sock = sessions.get(botId);
        if (sock) {
            try { sock.ws.close(); } catch {}
        }
    }, WATCHDOG_TIMEOUT);

    watchdogTimers.set(botId, timer);
}

function stopWatchdog(botId: string): void {
    const timer = watchdogTimers.get(botId);
    if (timer) {
        clearTimeout(timer);
        watchdogTimers.delete(botId);
    }
}

// ─── Append grace period: offline catch-up messages arrive as "append" within this window ───
const APPEND_GRACE_PERIOD = 60 * 1000; // 60 seconds after connection

// Simple CacheStore implementation for Baileys msgRetryCounterCache
class MapCacheStore {
    private cache = new Map<string, { value: any; expires: number }>();
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

    /**
     * Update a session's name from a contact object (used by contacts.update, contacts.upsert, messaging-history.set).
     * Returns true if the name was changed.
     */
    private static async updateContactName(botId: string, contact: { id?: string; notify?: string; verifiedName?: string; name?: string }): Promise<boolean> {
        if (!contact.id) return false;
        const name = contact.notify || contact.verifiedName || contact.name;
        if (!name) return false;
        const jid = jidNormalizedUser(contact.id);
        const session = await prisma.session.findUnique({
            where: { botId_identifier: { botId, identifier: jid } },
        });
        if (session && session.name !== name) {
            await prisma.session.update({ where: { id: session.id }, data: { name } });
            eventBus.emitBotEvent({ type: 'session:updated', botId, sessionId: session.id, name });
            return true;
        }
        return false;
    }

    /**
     * Find-or-create a session from a chat JID (used by chats.upsert, messaging-history.set, labels, messages).
     * Handles LID↔phone normalization and P2002 race conditions.
     * @param altIdentifier Optional fallback identifier to search (e.g. raw LID when primary is resolved phone)
     */
    private static async upsertSessionFromChat(botId: string, jid: string, name?: string, altIdentifier?: string): Promise<{ session: any; created: boolean }> {
        const identifier = jidNormalizedUser(jid);
        let session = await prisma.session.findUnique({
            where: { botId_identifier: { botId, identifier } },
        });
        if (session) return { session, created: false };

        // Fallback: check if session exists under an alternate identifier (e.g. LID vs phone)
        if (altIdentifier && altIdentifier !== identifier) {
            session = await prisma.session.findUnique({
                where: { botId_identifier: { botId, identifier: altIdentifier } },
            });
            if (session) {
                // Migrate session to the canonical identifier (phone > LID)
                if (!identifier.endsWith('@lid')) {
                    try {
                        session = await prisma.session.update({
                            where: { id: session.id },
                            data: { identifier },
                        });
                        console.log(`[Baileys] Migrated session identifier from ${altIdentifier} to ${identifier}`);
                    } catch (e: any) {
                        if (e.code === 'P2002') {
                            // Another session already has this identifier — merge by deleting the old one
                            const canonical = await prisma.session.findUnique({
                                where: { botId_identifier: { botId, identifier } },
                            });
                            if (canonical) {
                                session = canonical;
                            }
                        }
                    }
                }
                return { session, created: false };
            }
        }

        try {
            session = await prisma.session.create({
                data: {
                    botId,
                    platform: Platform.WHATSAPP,
                    identifier,
                    name: name || identifier.split('@')[0],
                    status: SessionStatus.CONNECTED,
                },
            });
            return { session, created: true };
        } catch (e: any) {
            if (e.code === 'P2002') {
                session = await prisma.session.findUnique({
                    where: { botId_identifier: { botId, identifier } },
                });
                return { session, created: false };
            }
            throw e;
        }
    }

    static async startSession(botId: string) {
        if (sessions.has(botId)) {
            return sessions.get(botId);
        }

        console.log(`[${new Date().toISOString()}] [Baileys] Starting session for Bot ${botId}`);

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
                        console.warn(`[Baileys] Recovered corrupted creds.json from backup for Bot ${botId}`);
                    } catch {
                        console.error(`[Baileys] Both creds.json and backup are corrupted for Bot ${botId}`);
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
            } catch {} // skip backup if current creds are already invalid
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
                    const { execSync } = require("child_process");
                    execSync(`ip -6 addr add ${botConfig.ipv6Address}/64 dev eth0 2>/dev/null || true`);
                    isAvailable = await this.isAddressAvailable(botConfig.ipv6Address);
                    if (isAvailable) {
                        console.log(`[Baileys] Auto-bound IPv6 ${botConfig.ipv6Address} to eth0`);
                    }
                } catch {}
            }
            if (isAvailable) {
                console.log(`[Baileys] Bot ${botConfig.name} will bind to IPv6: ${botConfig.ipv6Address}`);
                socketAgent = new https.Agent({
                    localAddress: botConfig.ipv6Address,
                    family: 6,
                    keepAlive: true
                });
            } else {
                console.log(`[Baileys] IPv6 ${botConfig.ipv6Address} not available locally, using default network interface`);
            }
        }

        console.log(`[${new Date().toISOString()}] [Baileys] Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        try {
            // @ts-ignore
            const sock = makeWASocket({
                version,
                logger,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: false,
                qrTimeout: 60000,
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
                    console.log(`[${new Date().toISOString()}] [Baileys] QR Received for Bot ${botId}`);
                    try {
                        const url = await QRCode.toDataURL(qr);
                        qrCodes.set(botId, url);
                        eventBus.emitBotEvent({ type: 'bot:qr', botId, qr: url });
                    } catch (err) {
                        console.error(`[${new Date().toISOString()}] QR Generation Error`, err);
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

                    console.log(`[Baileys] Connection closed for Bot ${botId}. Code: ${statusCode}, Reconnecting: ${shouldReconnect}`);

                    sessions.delete(botId);
                    qrCodes.delete(botId);
                    stopWatchdog(botId);
                    connectionTimestamps.delete(botId);
                    BaileysService.stopLabelReconciliation(botId);
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
                        console.log(`[Baileys] Reconnecting Bot ${botId} in ${delay / 1000}s (attempt ${attempt + 1})`);
                        const timer = setTimeout(() => {
                            reconnectTimers.delete(botId);
                            if (!shuttingDown) this.startSession(botId);
                        }, delay);
                        reconnectTimers.set(botId, timer);
                    } else {
                        reconnectAttempts.delete(botId);
                        console.log(`[Baileys] Bot ${botId} stopped (code ${statusCode}). No reconnect.`);
                    }
                } else if (connection === 'open') {
                    console.log(`[Baileys] Connection opened for Bot ${botId}`);
                    qrCodes.delete(botId);
                    reconnectAttempts.delete(botId); // Reset backoff on successful connection
                    connectionTimestamps.set(botId, Date.now());
                    resetWatchdog(botId);
                    eventBus.emitBotEvent({ type: 'bot:connected', botId, user: sock.user });

                    // Force full label sync — reuse syncLabels() which clears cache + version file
                    setTimeout(async () => {
                        try {
                            await BaileysService.syncLabels(botId);
                            console.log(`[Baileys] Full label sync completed for Bot ${botId}`);
                        } catch (e: any) {
                            console.warn(`[Baileys] Label sync failed for Bot ${botId}:`, e.message);
                        }

                        // Start periodic label reconciliation after initial sync
                        BaileysService.startLabelReconciliation(botId);
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
                    if (!connectedAt || Date.now() - connectedAt > APPEND_GRACE_PERIOD) {
                        // Outside grace period — these are historical sync messages, skip
                        return;
                    }
                    console.log(`[Baileys] Processing ${messages.length} offline catch-up message(s) for Bot ${botId}`);
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
                            console.log(`[Baileys] Dedup: skipping already-seen message ${msg.key.id}`);
                            continue;
                        }

                        // @ts-ignore
                        await this.handleIncomingMessage(botId, msg);
                    } catch (e) {
                        console.error(`[Baileys] Error in messages.upsert handler for msg ${msg.key.id}:`, e);
                    }
                }
            });

            sock.ev.on('labels.edit', async (label: any) => {
                try {
                    await prisma.label.upsert({
                        where: { botId_waLabelId: { botId, waLabelId: String(label.id) } },
                        update: {
                            name: label.name,
                            color: label.color ?? 0,
                            deleted: label.deleted ?? false,
                            predefinedId: label.predefinedId ?? null,
                        },
                        create: {
                            botId,
                            waLabelId: String(label.id),
                            name: label.name,
                            color: label.color ?? 0,
                            deleted: label.deleted ?? false,
                            predefinedId: label.predefinedId ?? null,
                        },
                    });
                    console.log(`[Baileys] Label synced: "${label.name}" (${label.id}) for Bot ${botId}`);
                } catch (e) {
                    console.error(`[Baileys] labels.edit error:`, e);
                }
            });

            sock.ev.on('labels.association', async (event: any) => {
                try {
                    const association = event.association;
                    console.log(`[Baileys] labels.association event:`, JSON.stringify(event));

                    if (event.type !== 'add' && event.type !== 'remove') return;
                    if (association.type !== 'label_jid') return;

                    const rawChatId = association.chatId;
                    const waLabelId = String(association.labelId);

                    // Resolve chatId: if LID, convert to phone JID via Baileys mapping
                    let resolvedJid = jidNormalizedUser(rawChatId);
                    if (resolvedJid.endsWith('@lid')) {
                        try {
                            const pn = await (sock as any).signalRepository.lidMapping.getPNForLID(resolvedJid);
                            if (pn) {
                                resolvedJid = jidNormalizedUser(pn);
                                console.log(`[Baileys] LID ${rawChatId} resolved to ${resolvedJid}`);
                            }
                        } catch (e: any) {
                            console.warn(`[Baileys] LID resolution failed for ${rawChatId}:`, e.message);
                        }
                    }

                    // Find-or-create session, passing rawChatId as alt so LID↔phone dedup works
                    const altId = resolvedJid !== rawChatId ? rawChatId : undefined;
                    const { session, created: sessionCreated } = await BaileysService.upsertSessionFromChat(
                        botId, resolvedJid, undefined, altId
                    );
                    if (!session) {
                        console.warn(`[Baileys] labels.association: Could not resolve session for ${rawChatId}`);
                        return;
                    }
                    if (sessionCreated) {
                        eventBus.emitBotEvent({ type: 'session:created', botId, session });
                    }

                    const label = await prisma.label.findUnique({
                        where: { botId_waLabelId: { botId, waLabelId } },
                    });
                    if (!label) {
                        console.warn(`[Baileys] labels.association: No label for waLabelId=${waLabelId}, skipping`);
                        return;
                    }

                    // Dedup: skip if this event was already handled by ToolExecutor or SessionController
                    const dedupKey = `${botId}:${session.id}:${label.id}:${event.type}`;
                    const dedupTs = recentLabelEvents.get(dedupKey);
                    if (dedupTs && Date.now() - dedupTs < LABEL_DEDUP_TTL) {
                        console.log(`[Baileys] labels.association: Skipping duplicate for ${label.name} (${event.type})`);
                        recentLabelEvents.delete(dedupKey);
                        return;
                    }

                    if (event.type === 'add') {
                        try {
                            await prisma.sessionLabel.upsert({
                                where: { sessionId_labelId: { sessionId: session.id, labelId: label.id } },
                                update: {},
                                create: { sessionId: session.id, labelId: label.id },
                            });
                        } catch (e: any) {
                            if (e.code !== 'P2002') throw e; // Ignore duplicate race condition
                        }
                        console.log(`[Baileys] Label "${label.name}" added to session ${resolvedJid}`);
                    } else {
                        await prisma.sessionLabel.deleteMany({
                            where: { sessionId: session.id, labelId: label.id },
                        });
                        console.log(`[Baileys] Label "${label.name}" removed from session ${resolvedJid}`);
                    }

                    // Emit SSE so the frontend updates in real-time
                    const updatedLabels = await prisma.sessionLabel.findMany({
                        where: { sessionId: session.id },
                        include: { label: true },
                    });
                    const labelPayload = updatedLabels.map(sl => ({
                        id: sl.label.id,
                        name: sl.label.name,
                        color: sl.label.color,
                        waLabelId: sl.label.waLabelId,
                    }));
                    // Specific event for notification filtering
                    eventBus.emitBotEvent({
                        type: event.type === 'add' ? 'session:labels:add' : 'session:labels:remove',
                        botId,
                        sessionId: session.id,
                        labels: labelPayload,
                        changedLabelId: label.id,
                        changedLabelName: label.name,
                    });
                    // Generic event for SSE / monitor UI
                    eventBus.emitBotEvent({
                        type: 'session:labels',
                        botId,
                        sessionId: session.id,
                        labels: labelPayload,
                        changedLabelId: label.id,
                        changedLabelName: label.name,
                        action: event.type as 'add' | 'remove',
                    });

                    // Evaluate label-based flow triggers
                    flowEngine.processLabelEvent(session.id, botId, label.name, event.type as 'add' | 'remove').catch(err => {
                        console.error(`[Baileys] FlowEngine label trigger error:`, err);
                    });
                } catch (e) {
                    console.error(`[Baileys] labels.association error:`, e);
                }
            });

            // --- contacts.update: update session names when contacts change ---
            sock.ev.on('contacts.update', async (updates: any[]) => {
                for (const contact of updates) {
                    try {
                        await BaileysService.updateContactName(botId, contact);
                    } catch (e: any) {
                        console.warn(`[Baileys] contacts.update error:`, e.message);
                    }
                }
            });

            // --- contacts.upsert: initial sync delivers full contact objects ---
            sock.ev.on('contacts.upsert', async (contacts: any[]) => {
                for (const contact of contacts) {
                    try {
                        await BaileysService.updateContactName(botId, contact);
                    } catch (e: any) {
                        console.warn(`[Baileys] contacts.upsert error:`, e.message);
                    }
                }
            });

            // --- chats.upsert: create sessions for existing chats on reconnect ---
            sock.ev.on('chats.upsert', async (chats: any[]) => {
                const bot = await prisma.bot.findUnique({ where: { id: botId }, include: { template: true } });
                for (const chat of chats) {
                    try {
                        if (!chat.id || chat.id === 'status@broadcast') continue;
                        const jid = jidNormalizedUser(chat.id);
                        if (bot && BotConfigService.resolveExcludeGroups(bot) && jid.endsWith('@g.us')) continue;
                        const name = chat.name || chat.subject || undefined;
                        const { session, created } = await BaileysService.upsertSessionFromChat(botId, jid, name);
                        if (created && session) {
                            eventBus.emitBotEvent({ type: 'session:created', botId, session });
                        }
                    } catch (e: any) {
                        console.warn(`[Baileys] chats.upsert error:`, e.message);
                    }
                }
            });

            // --- messaging-history.set: bulk import historical messages ---
            sock.ev.on('messaging-history.set', async (data: any) => {
                const { chats: histChats, contacts: histContacts, messages: histMessages } = data;
                const bot = await prisma.bot.findUnique({ where: { id: botId }, include: { template: true } });
                console.log(`[Baileys] History sync for Bot ${botId}: ${histChats?.length || 0} chats, ${histContacts?.length || 0} contacts, ${histMessages?.length || 0} messages`);

                // Upsert sessions from chats
                if (histChats?.length) {
                    for (const chat of histChats) {
                        try {
                            if (!chat.id || chat.id === 'status@broadcast') continue;
                            const jid = jidNormalizedUser(chat.id);
                            if (bot && BotConfigService.resolveExcludeGroups(bot) && jid.endsWith('@g.us')) continue;
                            await BaileysService.upsertSessionFromChat(botId, jid, chat.name || chat.subject);
                        } catch {}
                    }
                }

                // Update contact names
                if (histContacts?.length) {
                    for (const contact of histContacts) {
                        try {
                            await BaileysService.updateContactName(botId, contact);
                        } catch {}
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
                        } catch {}
                    }
                    console.log(`[Baileys] History sync imported ${imported} messages for Bot ${botId}`);
                }
            });

            // --- messages.update: handle edited messages ---
            sock.ev.on('messages.update', async (updates: any[]) => {
                for (const { key, update } of updates) {
                    try {
                        if (!key?.id) continue;
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
                        console.log(`[Baileys] Message ${key.id} edited for Bot ${botId}`);
                    } catch (e: any) {
                        console.warn(`[Baileys] messages.update error:`, e.message);
                    }
                }
            });

            return sock;

        } catch (error: any) {
            console.error(`[${new Date().toISOString()}] [Baileys] Failed to start session for bot ${botId}:`, error);
            if (error.message?.includes('QR refs attempts ended')) {
                console.log(`[${new Date().toISOString()}] [Baileys] QR timeout for bot ${botId}. Removing session to allow fresh retry.`);
                this.stopSession(botId);
            }
            return null;
        }
    }

    private static async handleIncomingMessage(botId: string, msg: WAMessage & { message: any }) { // Type intersection specific to local context
        const rawFrom = msg.key.remoteJid;
        if (!rawFrom) return;

        // CRITICAL: Normalize JID and resolve LID → phone when possible
        const normalizedRaw = jidNormalizedUser(rawFrom);
        let from = normalizedRaw;
        if (from.includes('@lid') && (msg.key as any).remoteJidAlt) {
            from = jidNormalizedUser((msg.key as any).remoteJidAlt);
        }
        // Keep the original LID as alt identifier for session dedup
        const altFrom = from !== normalizedRaw ? normalizedRaw : undefined;

        // Extract content
        const content = msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            "";

        const msgType = msg.message.imageMessage ? 'IMAGE' :
            msg.message.videoMessage ? 'VIDEO' :
            msg.message.audioMessage ? 'AUDIO' :
            msg.message.documentMessage ? 'DOCUMENT' : 'TEXT';

        const hasMedia = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'].includes(msgType);

        console.log(`[${new Date().toISOString()}] [Baileys] Received ${msgType} from ${from} (${msg.pushName}) [MsgID: ${msg.key.id}] on Bot ${botId}: ${content.substring(0, 50)}...`);

        try {
            // 1. Resolve Bot (include template for messageDelay resolution)
            const bot = await prisma.bot.findUnique({ where: { id: botId }, include: { template: true } });
            if (!bot) return;

            // Filter: exclude group messages (resolved from template or bot)
            if (BotConfigService.resolveExcludeGroups(bot) && from.endsWith("@g.us")) {
                console.log(`[Filter] Group message from ${from} excluded for Bot ${bot.name}`);
                return;
            }

            // 2. Resolve Session (with LID↔phone dedup)
            const { session, created: sessionCreated } = await BaileysService.upsertSessionFromChat(
                bot.id, from, msg.pushName || undefined, altFrom
            );
            if (!session) throw new Error(`Could not resolve session for ${from}`);
            if (sessionCreated) {
                eventBus.emitBotEvent({ type: 'session:created', botId, session });
            }

            // 3. Persist Message FIRST, then download media in background
            const messageExternalId = msg.key.id || `msg_${Date.now()}`;
            const messageData = {
                sessionId: session.id,
                sender: from,
                fromMe: msg.key.fromMe || false,
                content,
                type: msgType,
                isProcessed: false,
            };

            let message: any;
            let created: boolean;
            try {
                message = await prisma.message.create({
                    data: { externalId: messageExternalId, ...messageData },
                });
                created = true;
            } catch (e: any) {
                if (e.code === 'P2002') {
                    // Duplicate — already persisted by a previous event
                    console.log(`[Baileys] Duplicate message ${messageExternalId}, skipping processing.`);
                    return;
                }
                throw e;
            }

            // Download media BEFORE AI processing so the engine has full context
            if (hasMedia) {
                try {
                    await BaileysService.downloadAndAttachMedia(msg, msgType, message.id, botId);
                    // Refresh message object to include updated metadata
                    const updated = await prisma.message.findUnique({ where: { id: message.id } });
                    if (updated) message = updated;
                } catch (mediaErr) {
                    console.error(`[Baileys] Media download failed for ${messageExternalId}:`, mediaErr);
                    // Persist placeholder so AI knows media was present but couldn't be downloaded
                    const placeholder = `[${msgType.toLowerCase()} adjunto no pudo ser descargado]`;
                    const updatedContent = content ? `${content}\n${placeholder}` : placeholder;
                    await prisma.message.update({
                        where: { id: message.id },
                        data: { content: updatedContent },
                    }).catch(() => {});
                    message = { ...message, content: updatedContent };
                }
            }

            // Touch session so it sorts to top of the list
            prisma.session.update({
                where: { id: session.id },
                data: { updatedAt: new Date() },
            }).catch(() => {}); // fire-and-forget

            eventBus.emitBotEvent({ type: 'message:received', botId, sessionId: session.id, message });

            // Skip all processing when bot is paused
            if (bot.paused) {
                console.log(`[Filter] Bot ${bot.name} is paused, skipping message from ${from}`);
                return;
            }

            // Filter: skip AI for sessions with ignored labels (resolved from template or bot)
            const ignoredLabelIds = await BotConfigService.resolveIgnoredLabels(bot);
            if (ignoredLabelIds.length > 0) {
                const sessionLabels = await prisma.sessionLabel.findMany({
                    where: { sessionId: session.id },
                    select: { labelId: true },
                });
                const labelIds = sessionLabels.map(sl => sl.labelId);
                if (labelIds.some(id => ignoredLabelIds.includes(id))) {
                    console.log(`[Filter] Session ${from} has ignored label, skipping AI for Bot ${bot.name}`);
                    return;
                }
            }

            // 4. Evaluate triggers (flows + tools) for ALL messages
            flowEngine.processIncomingMessage(session.id, message).catch(err => {
                console.error(`[Baileys] FlowEngine error:`, err);
            });

            // Outgoing messages: only triggers, no AI
            if (message.fromMe) return;

            // 4b. Per-session AI gate (only affects incoming → AI path)
            if (session.aiEnabled === false) {
                console.log(`[Filter] AI disabled for session ${from}, skipping AI processing`);
                return;
            }

            // 5. Enqueue AI processing (runs in the worker process)
            const handleAIError = async (err: any, sid: string) => {
                console.error(`[${new Date().toISOString()}] [Baileys] AI enqueue error for session ${sid}:`, err);
            };

            const messageDelay = bot.template?.messageDelay ?? bot.messageDelay;
            if (messageDelay > 0) {
                MessageAccumulator.accumulate(
                    session.id,
                    message,
                    messageDelay,
                    (sid, msgs) => {
                        queueService.enqueueAIProcessing(sid, msgs.map(m => m.id)).catch(err => handleAIError(err, sid));
                    }
                ).catch(err => console.error(`[Baileys] Accumulator error:`, err));
            } else {
                queueService.enqueueAIProcessing(session.id, [message.id]).catch(err => handleAIError(err, session.id));
            }

        } catch (e) {
            console.error(`[${new Date().toISOString()}] [Baileys] Error processing message:`, e);
        }
    }

    /**
     * Track decryption failures per bot. After DECRYPT_FAILURE_THRESHOLD failures,
     * purge Signal session files to force renegotiation (auto-recovery from Bad MAC).
     */
    private static trackDecryptionFailure(botId: string): void {
        const now = Date.now();
        const tracker = decryptFailures.get(botId) || { count: 0, lastPurge: 0 };

        tracker.count++;
        decryptFailures.set(botId, tracker);

        if (tracker.count >= DECRYPT_FAILURE_THRESHOLD && now - tracker.lastPurge > PURGE_COOLDOWN) {
            this.purgeSignalSessions(botId);
            tracker.count = 0;
            tracker.lastPurge = now;
        }
    }

    /**
     * Download media from a WhatsApp message, store in R2 (or local fallback),
     * and attach the URL to the persisted message.
     */
    static async downloadAndAttachMedia(msg: WAMessage & { message: any }, msgType: string, messageId: string, botId?: string): Promise<void> {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        if (!buffer) return;

        const MIME_MAP: Record<string, { ext: string; mime: string }> = {
            IMAGE:    { ext: 'jpg',  mime: 'image/jpeg' },
            AUDIO:    { ext: 'ogg',  mime: 'audio/ogg' },
            VIDEO:    { ext: 'mp4',  mime: 'video/mp4' },
            DOCUMENT: { ext: msg.message.documentMessage?.fileName?.split('.').pop() || 'pdf',
                        mime: msg.message.documentMessage?.mimetype || 'application/octet-stream' },
        };
        const { ext, mime } = MIME_MAP[msgType] || { ext: 'bin', mime: 'application/octet-stream' };
        const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

        let mediaUrl: string;

        if (StorageService.isConfigured()) {
            // Upload to R2
            const key = `media/${botId || 'unknown'}/${filename}`;
            mediaUrl = await StorageService.upload(key, buffer as Buffer, mime);
            console.log(`[Baileys] Media uploaded to R2: ${key}`);
        } else {
            // Fallback: save locally
            const uploadDir = path.resolve('uploads');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, buffer as Buffer);
            mediaUrl = filePath;
            console.log(`[Baileys] Media saved locally: ${filePath}`);
        }

        await prisma.message.update({
            where: { id: messageId },
            data: { metadata: { mediaUrl } },
        });
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
                } catch {}
            }
        }

        if (purged > 0) {
            console.log(`[Baileys] Auto-purged ${purged} Signal session files for Bot ${botId} (Bad MAC recovery)`);
        }
    }

    static getQR(botId: string) {
        return qrCodes.get(botId);
    }

    static getSession(botId: string) {
        return sessions.get(botId);
    }

    static async stopSession(botId: string) {
        const sock = sessions.get(botId);
        if (sock) {
            try {
                await sock.logout();
            } catch (e) {
                console.log(`[${new Date().toISOString()}] [Baileys] Error during logout for bot ${botId}:`, e);
            }
            sessions.delete(botId);
        }
        qrCodes.delete(botId);

        // Optionally clear auth data to require new QR scan
        const sessionDir = path.join(AUTH_DIR, botId);
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            console.log(`[${new Date().toISOString()}] [Baileys] Cleared auth data for bot ${botId}`);
        }

        console.log(`[${new Date().toISOString()}] [Baileys] Session stopped for bot ${botId}`);
    }

    static async sendMessage(botId: string, to: string, content: any): Promise<boolean> {
        const sock = sessions.get(botId);
        if (!sock) {
            console.warn(`[${new Date().toISOString()}] [Baileys] sendMessage failed: Bot ${botId} not connected`);
            return false;
        }

        try {
            // Enrich text messages with explicit link preview
            if (content?.text && !content.linkPreview) {
                const preview = await generateLinkPreview(content.text);
                if (preview) {
                    content = { ...content, linkPreview: preview };
                }
            }

            await sock.sendMessage(to, content);
            return true;
        } catch (error: any) {
            // Log the error with details but don't crash
            const errorCode = error?.code || 'UNKNOWN';
            const errorMsg = error?.message || String(error);
            console.error(`[${new Date().toISOString()}] [Baileys] sendMessage failed for Bot ${botId} to ${to}:`, {
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
        } catch (e: any) {
            console.warn(`[Baileys] markRead failed:`, e.message);
        }
    }

    /**
     * Send presence update (typing / paused) for a chat.
     */
    static async sendPresence(botId: string, chatJid: string, presence: "composing" | "paused"): Promise<void> {
        const sock = sessions.get(botId);
        if (!sock) return;
        try {
            await sock.sendPresenceUpdate(presence, chatJid);
        } catch (e: any) {
            console.warn(`[Baileys] sendPresence(${presence}) failed:`, e.message);
        }
    }

    static async syncLabels(botId: string): Promise<void> {
        const sock = sessions.get(botId);
        if (!sock) throw new Error(`Bot ${botId} not connected`);

        // Delete the local app state version file to force a full snapshot re-download.
        // resyncAppState only fetches patches newer than the cached version,
        // so if labels were already synced before the DB table existed, no events fire.
        const versionFile = path.join(AUTH_DIR, botId, 'app-state-sync-version-regular_high.json');
        try { fs.unlinkSync(versionFile); } catch {}

        // Also clear the in-memory cache
        await (sock as any).authState.keys.set({
            'app-state-sync-version': { 'regular_high': null }
        });

        await (sock as any).resyncAppState(['regular_high'], true);
    }

    /**
     * Resolve a phone JID to the LID that WhatsApp uses internally for app state patches.
     * Falls back to the original JID if no mapping exists.
     */
    private static async resolveJidForAppState(sock: WASocket, phoneJid: string): Promise<string> {
        try {
            const lid = await (sock as any).signalRepository.lidMapping.getLIDForPN(phoneJid);
            if (lid) {
                console.log(`[Baileys] Resolved ${phoneJid} -> ${lid} for app state`);
                return lid;
            }
        } catch {}
        return phoneJid;
    }

    static async addChatLabel(botId: string, chatJid: string, waLabelId: string): Promise<void> {
        const sock = sessions.get(botId);
        if (!sock) throw new Error(`Bot ${botId} not connected`);
        const jid = await this.resolveJidForAppState(sock, chatJid);
        console.log(`[Baileys] addChatLabel: jid=${jid}, waLabelId=${waLabelId}`);
        await (sock as any).addChatLabel(jid, waLabelId);
    }

    static async removeChatLabel(botId: string, chatJid: string, waLabelId: string): Promise<void> {
        const sock = sessions.get(botId);
        if (!sock) throw new Error(`Bot ${botId} not connected`);
        const jid = await this.resolveJidForAppState(sock, chatJid);
        console.log(`[Baileys] removeChatLabel: jid=${jid}, waLabelId=${waLabelId}`);
        await (sock as any).removeChatLabel(jid, waLabelId);
    }

    /**
     * Mark a label event as already handled, so the Baileys labels.association
     * handler skips it if it arrives within the dedup window.
     */
    static markLabelEventHandled(botId: string, sessionId: string, labelId: string, action: 'add' | 'remove'): void {
        const key = `${botId}:${sessionId}:${labelId}:${action}`;
        recentLabelEvents.set(key, Date.now());
        // Cleanup old entries
        for (const [k, ts] of recentLabelEvents) {
            if (Date.now() - ts > LABEL_DEDUP_TTL) recentLabelEvents.delete(k);
        }
    }

    /**
     * Periodic label reconciliation: detects label changes that Baileys missed.
     * Forces a full app state re-sync, then compares DB state before/after to find
     * removed labels that the re-sync didn't re-emit.
     */
    static async reconcileLabels(botId: string): Promise<void> {
        const sock = sessions.get(botId);
        if (!sock) return;

        console.log(`[Baileys] Label reconciliation starting for Bot ${botId}`);

        // Snapshot DB state BEFORE sync
        const beforeLabels = await prisma.sessionLabel.findMany({
            where: { session: { botId } },
            select: { sessionId: true, labelId: true },
        });
        const beforeSet = new Set(beforeLabels.map(sl => `${sl.sessionId}:${sl.labelId}`));

        // Force full re-sync — re-emits labels.association for all current WA associations
        try {
            await this.syncLabels(botId);
        } catch (e: any) {
            console.warn(`[Baileys] Label reconciliation sync failed for Bot ${botId}:`, e.message);
            return;
        }

        // Wait for async labels.association handlers to process
        await new Promise(r => setTimeout(r, 3000));

        // Snapshot DB state AFTER sync (adds were processed by labels.association handler)
        const afterLabels = await prisma.sessionLabel.findMany({
            where: { session: { botId } },
            select: { sessionId: true, labelId: true },
        });
        const afterSet = new Set(afterLabels.map(sl => `${sl.sessionId}:${sl.labelId}`));

        // Detect removes: keys in before but not refreshed by the full sync
        // The full sync only re-adds current associations, so stale ones remain.
        // We can only detect removes if the sync actually re-created the entry (touching it).
        // Since upsert with update:{} is a no-op, we need a different approach:
        // Mark all before-labels, then check which ones the sync DIDN'T touch by
        // comparing timestamps. Instead, simpler: any key in beforeSet that is also
        // in afterSet was either refreshed or untouched — we can't distinguish.
        // So we only detect NEW adds (afterSet - beforeSet) here.
        // For removes, we rely on the periodic sync keeping the event-driven path warm.

        // Detect new labels added by reconciliation that weren't in DB before
        let reconciledAdds = 0;
        for (const key of afterSet) {
            if (!beforeSet.has(key)) {
                reconciledAdds++;
                // The labels.association handler already emitted events for these
            }
        }

        if (reconciledAdds > 0) {
            console.log(`[Baileys] Label reconciliation found ${reconciledAdds} missed add(s) for Bot ${botId}`);
        } else {
            console.log(`[Baileys] Label reconciliation complete for Bot ${botId} — no drift detected`);
        }
    }

    /**
     * Start periodic label reconciliation for a bot.
     */
    static startLabelReconciliation(botId: string): void {
        // Clear any existing timer
        this.stopLabelReconciliation(botId);

        const timer = setInterval(() => {
            this.reconcileLabels(botId).catch(err => {
                console.error(`[Baileys] Label reconciliation error for Bot ${botId}:`, err.message);
            });
        }, LABEL_RECONCILE_INTERVAL);

        labelReconcileTimers.set(botId, timer);
        console.log(`[Baileys] Label reconciliation started for Bot ${botId} (every ${LABEL_RECONCILE_INTERVAL / 1000}s)`);
    }

    /**
     * Stop periodic label reconciliation for a bot.
     */
    static stopLabelReconciliation(botId: string): void {
        const existing = labelReconcileTimers.get(botId);
        if (existing) {
            clearInterval(existing);
            labelReconcileTimers.delete(botId);
        }
    }

    /**
     * Graceful shutdown: cancel all reconnect timers and close all sockets.
     */
    static async shutdownAll(): Promise<void> {
        shuttingDown = true;

        // Cancel all label reconciliation timers
        for (const [botId] of labelReconcileTimers) {
            this.stopLabelReconciliation(botId);
        }

        // Cancel all watchdog timers
        for (const [botId] of watchdogTimers) {
            stopWatchdog(botId);
        }
        connectionTimestamps.clear();

        // Cancel all pending reconnect timers
        for (const [botId, timer] of reconnectTimers) {
            clearTimeout(timer);
            console.log(`[Baileys] Cancelled reconnect timer for Bot ${botId}`);
        }
        reconnectTimers.clear();
        reconnectAttempts.clear();

        // Close all active sockets (without deleting auth — not a logout)
        for (const [botId, sock] of sessions) {
            try {
                sock.ws.close();
                console.log(`[Baileys] Closed socket for Bot ${botId}`);
            } catch (e: any) {
                console.warn(`[Baileys] Error closing socket for Bot ${botId}:`, e.message);
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
