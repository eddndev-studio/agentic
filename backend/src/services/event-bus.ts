import { EventEmitter } from 'node:events';
import type { LogEntry } from './system-logger';

export type BotEvent =
    | { type: 'bot:qr';           botId: string; qr: string }
    | { type: 'bot:connected';    botId: string; user: any }
    | { type: 'bot:disconnected'; botId: string; statusCode: number | undefined }
    | { type: 'message:received'; botId: string; sessionId: string; message: any }
    | { type: 'message:sent';     botId: string; sessionId: string; content: string }
    | { type: 'session:created';  botId: string; session: any }
    | { type: 'session:updated';  botId: string; sessionId: string; name: string }
    | { type: 'session:labels';   botId: string; sessionId: string; labels: any[]; changedLabelId?: string; action?: 'add' | 'remove' }
    | { type: 'flow:started';     botId: string; flowName: string; sessionId: string }
    | { type: 'flow:completed';   botId: string; flowName: string; sessionId: string }
    | { type: 'flow:failed';      botId: string; flowName: string; sessionId: string; error: string }
    | { type: 'tool:executed';    botId: string; toolName: string; sessionId: string; success: boolean };

export type SystemEvent = { type: 'system:log'; log: LogEntry };

class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(0);
    }

    emitBotEvent(payload: BotEvent): boolean {
        return super.emit('bot-event', payload);
    }

    subscribe(botId: string, callback: (event: BotEvent) => void): () => void {
        const handler = (event: BotEvent) => {
            if (event.botId === botId) callback(event);
        };
        this.on('bot-event', handler);
        return () => this.off('bot-event', handler);
    }

    subscribeAll(callback: (event: BotEvent) => void): () => void {
        this.on('bot-event', callback);
        return () => this.off('bot-event', callback);
    }

    emitSystemEvent(payload: SystemEvent): boolean {
        return super.emit('system-event', payload);
    }

    subscribeSystem(callback: (event: SystemEvent) => void): () => void {
        this.on('system-event', callback);
        return () => this.off('system-event', callback);
    }
}

export const eventBus = new EventBus();
