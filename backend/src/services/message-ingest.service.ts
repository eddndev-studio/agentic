import { type WAMessage, jidNormalizedUser } from '@whiskeysockets/baileys';
import { prisma } from './postgres.service';
import { eventBus } from './event-bus';
import { flowEngine } from '../core/flow';
import { BotConfigService } from './bot-config.service';
import { MediaService } from './media.service';
import { MessageAccumulator } from './accumulator.service';
import { queueService } from './queue.service';
import { upsertSessionFromChat } from './session-helpers';
import { config } from '../config';
import { safeParseMessageMetadata } from '../schemas';
import type { Message } from '@prisma/client';
import { createLogger } from '../logger';

const log = createLogger('MessageIngest');

// ─── In-memory message dedup cache (prevents reprocessing on reconnect/replay) ───
const messageDedup = new Map<string, number>(); // dedupKey -> timestamp

function isMessageDuplicate(key: string): boolean {
    const now = Date.now();
    // Lazy cleanup when cache reaches max size
    if (messageDedup.size >= config.messageIngest.dedupMax) {
        for (const [k, ts] of messageDedup) {
            if (now - ts > config.messageIngest.dedupTtl) messageDedup.delete(k);
        }
    }
    const existing = messageDedup.get(key);
    if (existing && now - existing < config.messageIngest.dedupTtl) return true;
    messageDedup.set(key, now);
    return false;
}

export class MessageIngestService {

    /**
     * Handle an incoming WhatsApp message: normalize JID, detect type, persist to DB,
     * download media, evaluate flow triggers, and enqueue AI processing.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Baileys message wrappers need broad type after unwrapping
    static async handleIncomingMessage(botId: string, msg: WAMessage & { message: any }): Promise<void> {
        const rawFrom = msg.key.remoteJid;
        if (!rawFrom) return;

        // CRITICAL: Normalize JID and resolve LID -> phone when possible
        const normalizedRaw = jidNormalizedUser(rawFrom);
        let from = normalizedRaw;
        const keyWithAlt = msg.key as typeof msg.key & { remoteJidAlt?: string };
        if (from.includes('@lid') && keyWithAlt.remoteJidAlt) {
            from = jidNormalizedUser(keyWithAlt.remoteJidAlt);
        }
        // Keep the original LID as alt identifier for session dedup
        const altFrom = from !== normalizedRaw ? normalizedRaw : undefined;

        // Unwrap view-once, ephemeral, and document-with-caption wrappers
        let m = msg.message;
        if (m.viewOnceMessage) m = m.viewOnceMessage.message;
        else if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
        else if (m.ephemeralMessage) m = m.ephemeralMessage.message;
        if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

        // Skip protocol messages (edits/deletes handled elsewhere)
        if (m.protocolMessage || m.senderKeyDistributionMessage) return;

        // Detect message type
        const msgType =
            m.stickerMessage   ? 'STICKER' :
            m.reactionMessage  ? 'REACTION' :
            m.imageMessage     ? 'IMAGE' :
            m.videoMessage     ? 'VIDEO' :
            m.audioMessage     ? (m.audioMessage.ptt ? 'PTT' : 'AUDIO') :
            m.documentMessage  ? 'DOCUMENT' :
            m.contactMessage   ? 'CONTACT' :
            m.contactsArrayMessage ? 'CONTACT' :
            m.locationMessage  ? 'LOCATION' :
            m.liveLocationMessage ? 'LOCATION' :
            m.pollCreationMessage ? 'POLL' :
            'TEXT';

        // Extract content based on type
        let content = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON field
        let extraMetadata: Record<string, any> = {};

        switch (msgType) {
            case 'TEXT':
                content = m.conversation || m.extendedTextMessage?.text || '';
                break;
            case 'IMAGE':
                content = m.imageMessage?.caption || '';
                break;
            case 'VIDEO':
                content = m.videoMessage?.caption || '';
                break;
            case 'DOCUMENT':
                content = m.documentMessage?.caption || m.documentMessage?.fileName || '';
                break;
            case 'STICKER':
                content = '';
                extraMetadata.animated = !!m.stickerMessage?.isAnimated;
                break;
            case 'REACTION':
                content = m.reactionMessage?.text || '';  // emoji or empty = removed
                extraMetadata.reactedTo = {
                    id: m.reactionMessage?.key?.id,
                    fromMe: m.reactionMessage?.key?.fromMe,
                };
                break;
            case 'CONTACT': {
                const single = m.contactMessage;
                const arr = m.contactsArrayMessage?.contacts;
                if (single) {
                    content = single.displayName || '';
                    extraMetadata.vcard = single.vcard;
                } else if (arr) {
                    content = arr.map((c: { displayName?: string }) => c.displayName).join(', ');
                    extraMetadata.contacts = arr.map((c: { displayName?: string; vcard?: string }) => ({ name: c.displayName, vcard: c.vcard }));
                }
                break;
            }
            case 'LOCATION': {
                const loc = m.locationMessage || m.liveLocationMessage;
                content = loc?.name || loc?.address || '';
                extraMetadata.latitude = loc?.degreesLatitude;
                extraMetadata.longitude = loc?.degreesLongitude;
                extraMetadata.live = !!m.liveLocationMessage;
                break;
            }
            case 'POLL':
                content = m.pollCreationMessage?.name || '';
                extraMetadata.options = m.pollCreationMessage?.options?.map((o: { optionName?: string }) => o.optionName) || [];
                break;
            default: // AUDIO, PTT
                content = '';
                break;
        }

        const hasMedia = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'PTT'].includes(msgType);

        log.info(`Received ${msgType} from ${from} (${msg.pushName}) [MsgID: ${msg.key.id}] on Bot ${botId}: ${(content || '').substring(0, 50)}...`);

        try {
            // 1. Resolve Bot (include template for messageDelay resolution)
            const bot = await prisma.bot.findUnique({ where: { id: botId }, include: { template: true } });
            if (!bot) return;

            // 2. Resolve Session (with LID<->phone dedup) -- ALWAYS, even for filtered messages
            const { session, created: sessionCreated } = await upsertSessionFromChat(
                bot.id, from, msg.pushName || undefined, altFrom
            );
            if (!session) throw new Error(`Could not resolve session for ${from}`);
            if (sessionCreated) {
                eventBus.emitBotEvent({ type: 'session:created', botId, session });
            }

            // 3. ALWAYS persist message to DB (every type, every group, every direction)
            const messageExternalId = msg.key.id || `msg_${Date.now()}`;
            const messageData = {
                sessionId: session.id,
                sender: from,
                fromMe: msg.key.fromMe || false,
                content,
                type: msgType,
                isProcessed: false,
                ...(Object.keys(extraMetadata).length > 0 ? { metadata: extraMetadata } : {}),
            };

            let message: Message;
            try {
                message = await prisma.message.create({
                    data: { externalId: messageExternalId, ...messageData },
                });
            } catch (e: unknown) {
                if (e instanceof Error && 'code' in e && (e as Record<string, unknown>).code === 'P2002') {
                    log.info(`Duplicate message ${messageExternalId}, skipping processing.`);
                    return;
                }
                throw e;
            }

            // 4. Download media (stickers, images, audio, video, documents, PTT)
            if (hasMedia) {
                try {
                    await MediaService.downloadAndAttachMedia(msg, msgType, message.id, botId);
                    const updated = await prisma.message.findUnique({ where: { id: message.id } });
                    if (updated) message = updated;

                    // Generate AI descriptions only for IMAGE and DOCUMENT (skip stickers, audio, etc.)
                    if (msgType === 'IMAGE' || msgType === 'DOCUMENT') {
                        MediaService.generateMediaDescription(message.id, msgType, safeParseMessageMetadata(message.metadata).mediaUrl, bot.aiProvider)
                            .catch(err => log.warn(`Media description failed for ${messageExternalId}:`, err.message));
                    }
                } catch (mediaErr) {
                    log.error(`Media download failed for ${messageExternalId}:`, mediaErr);
                    const placeholder = `[${msgType.toLowerCase()} adjunto no pudo ser descargado]`;
                    const updatedContent = content ? `${content}\n${placeholder}` : placeholder;
                    await prisma.message.update({
                        where: { id: message.id },
                        data: { content: updatedContent },
                    }).catch(e => log.warn('media fallback content update failed:', (e as Error).message));
                    message = { ...message, content: updatedContent };
                }
            }

            // Touch session so it sorts to top of the list
            prisma.session.update({
                where: { id: session.id },
                data: { updatedAt: new Date() },
            }).catch(() => {}); // fire-and-forget: non-critical

            eventBus.emitBotEvent({ type: 'message:received', botId, sessionId: session.id, message });

            // -- From here on: filters only affect PROCESSING (flows, AI), NOT storage --

            // Skip processing for non-conversational types (reactions, stickers, polls, etc.)
            if (['REACTION', 'STICKER', 'CONTACT', 'LOCATION', 'POLL'].includes(msgType)) return;

            // Skip processing when bot is paused
            if (bot.paused) {
                log.info(`Bot ${bot.name} is paused, skipping processing for ${from}`);
                return;
            }

            // Skip processing for excluded group messages
            if (BotConfigService.resolveExcludeGroups(bot) && from.endsWith("@g.us")) {
                log.info(`Group message from ${from} excluded for Bot ${bot.name}`);
                return;
            }

            // Skip AI for sessions with ignored labels
            const ignoredLabelIds = await BotConfigService.resolveIgnoredLabels(bot);
            if (ignoredLabelIds.length > 0) {
                const sessionLabels = await prisma.sessionLabel.findMany({
                    where: { sessionId: session.id },
                    select: { labelId: true },
                });
                const labelIds = sessionLabels.map(sl => sl.labelId);
                if (labelIds.some(id => ignoredLabelIds.includes(id))) {
                    log.info(`Session ${from} has ignored label, skipping AI for Bot ${bot.name}`);
                    return;
                }
            }

            // 5. Evaluate triggers (flows + tools) for conversational messages
            flowEngine.processIncomingMessage(session.id, message).catch(err => {
                log.error('FlowEngine error:', err);
            });

            // Outgoing messages: only triggers, no AI
            if (message.fromMe) return;

            // Per-session AI gate
            if (session.aiEnabled === false) {
                log.info(`AI disabled for session ${from}, skipping AI processing`);
                return;
            }

            // 6. Enqueue AI processing
            const handleAIError = async (err: unknown, sid: string) => {
                log.error(`AI enqueue error for session ${sid}:`, err);
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
                ).catch(err => log.error('Accumulator error:', err));
            } else {
                queueService.enqueueAIProcessing(session.id, [message.id]).catch(err => handleAIError(err, session.id));
            }

        } catch (e) {
            log.error('Error processing message:', e);
        }
    }

    /**
     * Persist an outgoing message to the database and emit message:sent event.
     * Called after a message is successfully sent via the WhatsApp socket.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Baileys message content structure varies
    static async persistOutgoingMessage(botId: string, to: string, sentKeyId: string, content: any): Promise<void> {
        try {
            const { session } = await upsertSessionFromChat(botId, jidNormalizedUser(to));
            if (session) {
                const msgType =
                    content.image ? 'IMAGE' :
                    content.video ? 'VIDEO' :
                    content.audio ? (content.ptt ? 'PTT' : 'AUDIO') :
                    content.document ? 'DOCUMENT' :
                    content.sticker ? 'STICKER' : 'TEXT';
                const textContent =
                    content.text || content.caption || '';

                await prisma.message.create({
                    data: {
                        externalId: sentKeyId,
                        sessionId: session.id,
                        sender: jidNormalizedUser(to),
                        fromMe: true,
                        content: textContent,
                        type: msgType,
                        isProcessed: true,
                    },
                }).catch((e: unknown) => {
                    // P2002 = duplicate, already captured by messages.upsert
                    if (e instanceof Error && 'code' in e && (e as Record<string, unknown>).code !== 'P2002') log.warn('Failed to persist outgoing message:', e instanceof Error ? e.message : e);
                });

                eventBus.emitBotEvent({ type: 'message:sent', botId, sessionId: session.id, content: textContent });
            }
        } catch (e) {
            // Non-critical: don't fail the send if persistence fails
            log.warn('Outgoing message persistence error:', (e as Error).message);
        }
    }
}

export { isMessageDuplicate };
