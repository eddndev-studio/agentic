import { prisma } from './postgres.service';
import { eventBus } from './event-bus';
import { flowEngine } from '../core/flow';
import { queueService } from './queue.service';
import { BotConfigService } from './bot-config.service';
import { createLogger } from '../logger';

const log = createLogger('Emulator');

const EMU_PREFIX = 'emu://';

export class EmulatorService {
    /** Check if an identifier belongs to an emulator session */
    static isEmulatorSession(identifier: string): boolean {
        return identifier.startsWith(EMU_PREFIX);
    }

    /** Create a virtual session for emulation */
    static async createSession(botId: string): Promise<any> {
        const bot = await prisma.bot.findUnique({ where: { id: botId } });
        if (!bot) throw new Error('Bot not found');

        const identifier = `${EMU_PREFIX}${botId}/${Date.now()}`;
        const session = await prisma.session.create({
            data: {
                botId,
                identifier,
                name: `Emulator (${bot.name})`,
                platform: 'WHATSAPP',
                status: 'CONNECTED',
                aiEnabled: true,
            },
        });

        log.info(`Created emulator session ${session.id} for bot ${bot.name}`);
        return session;
    }

    /** Inject a user message into the processing pipeline */
    static async injectMessage(sessionId: string, content: string, type: string = 'TEXT', mediaUrl?: string): Promise<any> {
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: { bot: { include: { template: true } } },
        });
        if (!session) throw new Error('Session not found');
        if (!this.isEmulatorSession(session.identifier)) throw new Error('Not an emulator session');

        const bot = session.bot;
        const externalId = `emu_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Persist message
        const message = await prisma.message.create({
            data: {
                externalId,
                sessionId,
                sender: session.identifier,
                fromMe: false,
                content,
                type,
                isProcessed: false,
                ...(mediaUrl ? { metadata: { mediaUrl } } : {}),
            },
        });

        // Touch session
        prisma.session.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
        }).catch(() => {}); // fire-and-forget: non-critical

        // Emit message:received for SSE
        eventBus.emitBotEvent({ type: 'message:received', botId: bot.id, sessionId, message });

        // Evaluate flow triggers (same as production)
        flowEngine.processIncomingMessage(sessionId, message).catch(err => {
            log.error('FlowEngine error in emulator:', err.message);
        });

        // Skip AI if bot paused
        if (bot.paused) {
            log.info(`Bot ${bot.name} is paused, skipping AI in emulator`);
            return message;
        }

        // Enqueue AI processing (same as production path)
        queueService.enqueueAIProcessing(sessionId, [message.id]).catch(err => {
            log.error('AI enqueue error in emulator:', err.message);
        });

        return message;
    }

    /** Destroy emulator session and all its data */
    static async destroySession(sessionId: string): Promise<void> {
        const session = await prisma.session.findUnique({ where: { id: sessionId } });
        if (!session || !this.isEmulatorSession(session.identifier)) {
            throw new Error('Not an emulator session');
        }

        // Cascade delete handles messages, executions, conversation logs, session labels
        await prisma.session.delete({ where: { id: sessionId } });
        log.info(`Destroyed emulator session ${sessionId}`);
    }

    /** Reset conversation (keep session, clear messages + history) */
    static async resetSession(sessionId: string): Promise<void> {
        const session = await prisma.session.findUnique({ where: { id: sessionId } });
        if (!session || !this.isEmulatorSession(session.identifier)) {
            throw new Error('Not an emulator session');
        }

        await prisma.$transaction([
            prisma.message.deleteMany({ where: { sessionId } }),
            prisma.execution.deleteMany({ where: { sessionId } }),
        ]);

        // Clear conversation history in Redis
        const { ConversationService } = await import('./conversation.service');
        await ConversationService.clear(sessionId);

        log.info(`Reset emulator session ${sessionId}`);
    }
}
