import { ApiClient } from '../api';
import { detectMediaType } from './format-helpers';

export async function loadMessages(ctx: any, merge = false) {
    if (!ctx.selectedSession) return;
    try {
        const res = await ApiClient.get(`/sessions/${ctx.selectedSession.id}/messages?limit=${ctx.messageLimit}`);
        if (merge && ctx.messages.length > 0) {
            const existingIds = new Set(ctx.messages.map((m: any) => m.id));
            const newMsgs = (res.data || []).filter((m: any) => !existingIds.has(m.id));
            if (newMsgs.length > 0) {
                ctx.messages.push(...newMsgs);
                ctx.$nextTick(() => scrollToBottom(ctx));
            }
        } else {
            ctx.messages = res.data;
            ctx.$nextTick(() => scrollToBottom(ctx));
        }
        ctx.lastMessageCount = res.pagination.total;
        ctx.hasMoreMessages = (merge ? ctx.messages.length : res.data.length) < res.pagination.total;
    } catch (e) { console.error("Failed to load messages", e); }
}

export async function loadMoreMessages(ctx: any) {
    if (!ctx.selectedSession || ctx.loadingMore || !ctx.hasMoreMessages) return;
    ctx.loadingMore = true;
    const container = ctx.$refs.messagesContainer as HTMLElement;
    const prevHeight = container?.scrollHeight || 0;
    try {
        const offset = ctx.messages.length;
        const res = await ApiClient.get(`/sessions/${ctx.selectedSession.id}/messages?limit=${ctx.messageLimit}&offset=${offset}`);
        if (res.data.length === 0) {
            ctx.hasMoreMessages = false;
        } else {
            ctx.messages = [...res.data, ...ctx.messages];
            ctx.hasMoreMessages = ctx.messages.length < res.pagination.total;
            ctx.$nextTick(() => { if (container) container.scrollTop = container.scrollHeight - prevHeight; });
        }
    } catch (e) { console.error("Failed to load more messages", e); }
    finally { ctx.loadingMore = false; }
}

export function onChatScroll(ctx: any) {
    const container = ctx.$refs.messagesContainer as HTMLElement;
    if (!container) return;
    if (container.scrollTop < 100 && ctx.hasMoreMessages && !ctx.loadingMore) loadMoreMessages(ctx);
    ctx.showScrollDown = (container.scrollHeight - container.scrollTop - container.clientHeight) > 200;
}

export function scrollToBottom(ctx: any) {
    const container = ctx.$refs.messagesContainer as HTMLElement;
    if (container) container.scrollTop = container.scrollHeight;
}

export async function sendMessage(ctx: any) {
    if (!ctx.messageInput.trim() && !ctx.attachedFile) return;
    if (!ctx.selectedSession) return;
    ctx.sending = true;
    try {
        const payload: any = {};
        if (ctx.messageInput.trim()) payload.text = ctx.messageInput;
        if (ctx.attachedUrl && ctx.attachedMediaType) {
            payload.mediaUrl = ctx.attachedUrl;
            payload.mediaType = ctx.attachedMediaType;
            if (ctx.attachedFile) payload.fileName = ctx.attachedFile.name;
        }
        await ApiClient.post(`/sessions/${ctx.selectedSession.id}/send`, payload);
        ctx.messageInput = "";
        clearAttachment(ctx);
        setTimeout(() => loadMessages(ctx, true), 1500);
    } catch (e: any) {
        (window as any).__toast?.error("Send failed: " + (e.message || "Unknown error"));
    } finally { ctx.sending = false; }
}

export async function handleFileSelect(ctx: any, e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    ctx.attachedFile = file;
    ctx.uploadingFile = true;
    try {
        const res = await ApiClient.uploadFile(file);
        ctx.attachedUrl = res.url;
        ctx.attachedMediaType = detectMediaType(file);
    } catch (err: any) {
        (window as any).__toast?.error("Upload failed: " + (err.message || "Unknown"));
        clearAttachment(ctx);
    } finally {
        ctx.uploadingFile = false;
        (ctx.$refs.fileInput as HTMLInputElement).value = '';
    }
}

export function clearAttachment(ctx: any) {
    ctx.attachedFile = null;
    ctx.attachedUrl = '';
    ctx.attachedMediaType = '';
}

export function playNotifSound() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } catch {}
}

export async function reactToMessage(ctx: any, messageId: string, emoji: string) {
    if (!ctx.selectedSession) return;
    try {
        await ApiClient.post(`/sessions/${ctx.selectedSession.id}/react`, { messageId, emoji });
    } catch (e: any) {
        (window as any).__toast?.error("Reaction failed: " + (e.message || "Unknown"));
    }
}

export async function poll(ctx: any) {
    const { loadSessions } = await import('./session-methods');
    await loadSessions(ctx);
    if (ctx.selectedSession) {
        try {
            const res = await ApiClient.get(`/sessions/${ctx.selectedSession.id}/messages?limit=${ctx.messageLimit}`);
            if (res.pagination.total !== ctx.lastMessageCount) {
                const existingIds = new Set(ctx.messages.map((m: any) => m.id));
                const newMsgs = (res.data || []).filter((m: any) => !existingIds.has(m.id));
                if (newMsgs.length > 0) {
                    ctx.messages.push(...newMsgs);
                    ctx.$nextTick(() => scrollToBottom(ctx));
                }
                ctx.lastMessageCount = res.pagination.total;
                ctx.hasMoreMessages = ctx.messages.length < res.pagination.total;
            }
        } catch {}
    }
}
