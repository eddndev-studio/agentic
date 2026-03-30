import { EventEmitter } from 'node:events';
import type { LogEntry } from './system-logger';
import type { Message, Session } from '@prisma/client';

/** Lightweight label summary used in SSE payloads. */
export interface LabelPayload {
    id: string;
    name: string;
    color: number;
    waLabelId: string;
}

export type BotEvent =
    | { type: 'bot:qr';           botId: string; qr: string }
    | { type: 'bot:connected';    botId: string; user: { id: string; name?: string } | undefined }
    | { type: 'bot:disconnected'; botId: string; statusCode: number | undefined }
    | { type: 'bot:pairing-code'; botId: string; code: string }
    | { type: 'message:received'; botId: string; sessionId: string; message: Message }
    | { type: 'message:sent';     botId: string; sessionId: string; content: string }
    | { type: 'session:created';  botId: string; session: Session }
    | { type: 'session:updated';  botId: string; sessionId: string; name: string }
    | { type: 'session:labels';       botId: string; sessionId: string; labels: LabelPayload[]; changedLabelId?: string; changedLabelName?: string; action?: 'add' | 'remove' }
    | { type: 'session:labels:add';   botId: string; sessionId: string; labels: LabelPayload[]; changedLabelId?: string; changedLabelName?: string }
    | { type: 'session:labels:remove';botId: string; sessionId: string; labels: LabelPayload[]; changedLabelId?: string; changedLabelName?: string }
    | { type: 'flow:started';     botId: string; flowName: string; sessionId: string }
    | { type: 'flow:completed';   botId: string; flowName: string; sessionId: string }
    | { type: 'flow:failed';      botId: string; flowName: string; sessionId: string; error: string }
    | { type: 'tool:executed';    botId: string; toolName: string; sessionId: string; success: boolean }
    | { type: 'messages:deleted'; botId: string; sessionId: string; count: number }
    | { type: 'emulator:debug:trigger-eval'; botId: string; sessionId: string; triggers: Array<{ name: string; triggerType: string; matched: boolean; reason?: string }> }
    | { type: 'emulator:debug:ai-context'; botId: string; sessionId: string; systemPrompt: string; messageCount: number; toolCount: number; model: string; temperature: number }
    | { type: 'emulator:debug:ai-response'; botId: string; sessionId: string; content: string | null; thinking: string | null; toolCalls: Array<{ name: string; args: Record<string, unknown> }>; usage: { promptTokens: number; completionTokens: number; thinkingTokens?: number } | null; model: string }
    | { type: 'emulator:debug:tool-call'; botId: string; sessionId: string; toolName: string; args: Record<string, unknown>; result: unknown; success: boolean; durationMs: number }
    | { type: 'emulator:debug:flow-event'; botId: string; sessionId: string; flowName: string; event: 'started' | 'step' | 'completed' | 'failed'; stepOrder?: number; stepType?: string; error?: string };

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
