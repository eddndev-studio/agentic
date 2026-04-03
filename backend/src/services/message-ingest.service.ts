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
import type { NormalizedMessage } from '../providers/types';
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
     * Handle a normalized incoming message: persist to DB, download media,
     * evaluate flow triggers, and enqueue AI processing.
     *
     * Provider-agnostic: all platform-specific normalization (JID, unwrapping,
     * type detection, media download) is done by the provider's normalizer
     * BEFORE calling this method.
     */
    static async handleIncomingMessage(msg: NormalizedMessage): Promise<void> {
        const { botId, from, altFrom, type: msgType, id: messageExternalId } = msg;

        // Skip outgoing messages sent via our API — already persisted by persistOutgoingMessage()
        if (msg.fromMe) {
            const exists = await prisma.message.findFirst({ where: { externalId: messageExternalId }, select: { id: true } });
            if (exists) return;
        }

        const hasMedia = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'PTT'].includes(msgType);

        log.info(`Received ${msgType} from ${from} (${msg.pushName}) [MsgID: ${messageExternalId}] on Bot ${botId}: ${(msg.content || '').substring(0, 50)}...`);

        try {
            // 1. Resolve Bot (include template for messageDelay resolution)
            const bot = await prisma.bot.findUnique({ where: { id: botId }, include: { template: true } });
            if (!bot) return;

            // 2. Resolve Session (with alt identifier dedup) — ALWAYS, even for filtered messages
            const { session, created: sessionCreated } = await upsertSessionFromChat(
                bot.id, from, msg.pushName, altFrom
            );
            if (!session) throw new Error(`Could not resolve session for ${from}`);
            if (sessionCreated) {
                eventBus.emitBotEvent({ type: 'session:created', botId, session });
            }

            // 3. ALWAYS persist message to DB (every type, every group, every direction)
            const messageData = {
                sessionId: session.id,
                sender: from,
                fromMe: msg.fromMe,
                content: msg.content,
                type: msgType,
                isProcessed: false,
                ...(Object.keys(msg.metadata).length > 0 ? { metadata: msg.metadata as Record<string, any> } : {}),
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

            // 4. Store media (provider already downloaded the buffer)
            if (hasMedia) {
                if (msg.mediaBuffer) {
                    try {
                        await MediaService.attachMediaBuffer(
                            msg.mediaBuffer, msgType, message.id, botId,
                            msg.mediaMimeType, msg.mediaFileName,
                        );
                        const updated = await prisma.message.findUnique({ where: { id: message.id } });
                        if (updated) message = updated;

                        // Generate AI descriptions only for IMAGE and DOCUMENT
                        if (msgType === 'IMAGE' || msgType === 'DOCUMENT') {
                            MediaService.generateMediaDescription(message.id, msgType, safeParseMessageMetadata(message.metadata).mediaUrl, bot.aiProvider)
                                .catch(err => log.warn(`Media description failed for ${messageExternalId}:`, err.message));
                        }
                    } catch (mediaErr) {
                        log.error(`Media storage failed for ${messageExternalId}:`, mediaErr);
                        const placeholder = `[${msgType.toLowerCase()} adjunto no pudo ser procesado]`;
                        const updatedContent = msg.content ? `${msg.content}\n${placeholder}` : placeholder;
                        await prisma.message.update({
                            where: { id: message.id },
                            data: { content: updatedContent },
                        }).catch(e => log.warn('media fallback content update failed:', (e as Error).message));
                        message = { ...message, content: updatedContent };
                    }
                } else {
                    // Media download failed at provider level
                    const placeholder = `[${msgType.toLowerCase()} adjunto no pudo ser descargado]`;
                    const updatedContent = msg.content ? `${msg.content}\n${placeholder}` : placeholder;
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

            // Skip processing for non-conversational types
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
     * Called after a message is successfully sent via the provider.
     *
     * @param normalizedTo - Already-normalized recipient identifier (provider normalizes before calling)
     */
    static async persistOutgoingMessage(
        botId: string,
        normalizedTo: string,
        sentKeyId: string,
        msgType: string,
        textContent: string,
        mediaUrl?: string,
    ): Promise<void> {
        try {
            const isEmulator = normalizedTo.startsWith('emu://');
            const { session } = isEmulator
                ? { session: await prisma.session.findFirst({ where: { identifier: normalizedTo, botId } }) }
                : await upsertSessionFromChat(botId, normalizedTo);

            if (session) {
                const message = await prisma.message.create({
                    data: {
                        externalId: sentKeyId,
                        sessionId: session.id,
                        sender: normalizedTo,
                        fromMe: true,
                        content: textContent,
                        type: msgType,
                        isProcessed: true,
                        ...(mediaUrl ? { metadata: { mediaUrl } } : {}),
                    },
                }).catch((e: unknown) => {
                    if (e instanceof Error && 'code' in e && (e as Record<string, unknown>).code !== 'P2002') log.warn('Failed to persist outgoing message:', e instanceof Error ? e.message : e);
                    return null;
                });

                if (message) {
                    eventBus.emitBotEvent({ type: 'message:received', botId, sessionId: session.id, message });
                } else {
                    eventBus.emitBotEvent({ type: 'message:sent', botId, sessionId: session.id, content: textContent });
                }
            }
        } catch (e) {
            log.warn('Outgoing message persistence error:', (e as Error).message);
        }
    }
}

export { isMessageDuplicate };
