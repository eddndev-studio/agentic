import { BotEventSource } from '../events';
import { scrollToBottom, playNotifSound } from './message-methods';

export function setupSSE(ctx: any): BotEventSource {
    const client = new BotEventSource(ctx.botId!);
    client
        .on('message:received', (data: any) => {
            if (ctx.selectedSession && data.sessionId === ctx.selectedSession.id) {
                if (data.message?.id && !ctx.messages.some((m: any) => m.id === data.message.id)) {
                    ctx.messages.push(data.message);
                    ctx.$nextTick(() => scrollToBottom(ctx));
                }
            } else if (!data.message?.fromMe) {
                ctx.unreadCounts[data.sessionId] = (ctx.unreadCounts[data.sessionId] || 0) + 1;
                playNotifSound();
            }
            const s = ctx.sessions.find((s: any) => s.id === data.sessionId);
            if (s) {
                s.lastMessage = data.message;
                s.messageCount = (s.messageCount || 0) + 1;
                const idx = ctx.sessions.indexOf(s);
                if (idx > 0) { ctx.sessions.splice(idx, 1); ctx.sessions.unshift(s); }
            }
        })
        .on('message:sent', (data: any) => {
            const s = ctx.sessions.find((s: any) => s.id === data.sessionId);
            if (s) {
                s.lastMessage = { content: data.content, fromMe: true, type: 'TEXT', createdAt: new Date().toISOString() };
                const idx = ctx.sessions.indexOf(s);
                if (idx > 0) { ctx.sessions.splice(idx, 1); ctx.sessions.unshift(s); }
            }
        })
        .on('session:created', (data: any) => {
            if (data.session?.id && !ctx.sessions.some((s: any) => s.id === data.session.id)) {
                ctx.sessions.unshift(data.session);
            }
        })
        .on('session:labels', (data: any) => {
            const s = ctx.sessions.find((s: any) => s.id === data.sessionId);
            if (s) s.labels = data.labels;
            if (ctx.selectedSession?.id === data.sessionId) ctx.selectedSession.labels = data.labels;
        })
        .on('session:updated', (data: any) => {
            const s = ctx.sessions.find((s: any) => s.id === data.sessionId);
            if (s) s.name = data.name;
            if (ctx.selectedSession?.id === data.sessionId) ctx.selectedSession.name = data.name;
        })
        .on('session:typing', (data: any) => {
            const identifier = data.identifier;
            if (!identifier) return;
            const s = ctx.sessions.find((s: any) => s.identifier === identifier);
            if (!s) return;
            if (data.typing) {
                ctx.typingSessions[s.id] = true;
                if (ctx.typingIndicator[s.id]) clearTimeout(ctx.typingIndicator[s.id]!);
                ctx.typingIndicator[s.id] = setTimeout(() => { ctx.typingSessions[s.id] = false; }, 5000);
            } else {
                ctx.typingSessions[s.id] = false;
                if (ctx.typingIndicator[s.id]) { clearTimeout(ctx.typingIndicator[s.id]!); ctx.typingIndicator[s.id] = null; }
            }
        });
    client.connect();
    return client;
}
