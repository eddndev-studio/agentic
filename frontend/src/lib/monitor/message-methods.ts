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
    const hasFiles = ctx.attachments && ctx.attachments.length > 0;
    if (!ctx.messageInput.trim() && !hasFiles) return;
    if (!ctx.selectedSession) return;
    ctx.sending = true;
    try {
        const sessionUrl = `/sessions/${ctx.selectedSession.id}/send`;
        const caption = ctx.messageInput.trim();
        const replyId = ctx.replyingTo?.id;

        if (hasFiles) {
            // Send each file as a separate message; caption goes on the last one
            for (let i = 0; i < ctx.attachments.length; i++) {
                const att = ctx.attachments[i];
                const isLast = i === ctx.attachments.length - 1;
                const payload: any = {
                    mediaUrl: att.url,
                    mediaType: att.mediaType,
                    fileName: att.file.name,
                };
                if (isLast && caption) payload.text = caption;
                if (i === 0 && replyId) payload.quotedMessageId = replyId;
                await ApiClient.post(sessionUrl, payload);
            }
        } else {
            const payload: any = { text: caption };
            if (replyId) payload.quotedMessageId = replyId;
            await ApiClient.post(sessionUrl, payload);
        }

        ctx.messageInput = "";
        ctx.replyingTo = null;
        clearAttachments(ctx);
        setTimeout(() => loadMessages(ctx, true), 1500);
    } catch (e: any) {
        (window as any).__toast?.error("Send failed: " + (e.message || "Unknown error"));
    } finally { ctx.sending = false; }
}

export async function handleFileSelect(ctx: any, e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    ctx.uploadingFile = true;
    try {
        for (const file of Array.from(files)) {
            const res = await ApiClient.uploadFile(file);
            const mediaType = detectMediaType(file);
            const preview = ['IMAGE', 'VIDEO'].includes(mediaType) ? URL.createObjectURL(file) : null;
            ctx.attachments.push({ file, url: res.url, mediaType, preview });
        }
    } catch (err: any) {
        (window as any).__toast?.error("Upload failed: " + (err.message || "Unknown"));
    } finally {
        ctx.uploadingFile = false;
        (ctx.$refs.fileInput as HTMLInputElement).value = '';
    }
}

export function removeAttachment(ctx: any, index: number) {
    const att = ctx.attachments[index];
    if (att.preview) URL.revokeObjectURL(att.preview);
    ctx.attachments.splice(index, 1);
}

export function clearAttachments(ctx: any) {
    for (const att of ctx.attachments) {
        if (att.preview) URL.revokeObjectURL(att.preview);
    }
    ctx.attachments = [];
}

// Legacy compat
export function clearAttachment(ctx: any) { clearAttachments(ctx); }

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

/**
 * Build a map of externalId → emoji[] from REACTION messages.
 * Handles both Baileys (metadata.reactedTo.id) and WABA (metadata.reactionTargetId).
 * Keeps only the latest reaction per sender. Empty content = removal.
 */
export function buildReactionsMap(messages: any[]): Record<string, string[]> {
    const senderMap: Record<string, Record<string, string | null>> = {};

    for (const msg of messages) {
        if (msg.type !== 'REACTION') continue;
        // Support both metadata formats
        const targetId = msg.metadata?.reactedTo?.id || msg.metadata?.reactionTargetId;
        if (!targetId) continue;

        const sender = msg.sender || (msg.fromMe ? '__me__' : '__unknown__');
        if (!senderMap[targetId]) senderMap[targetId] = {};
        senderMap[targetId][sender] = msg.content || null;
    }

    const result: Record<string, string[]> = {};
    for (const [targetId, senders] of Object.entries(senderMap)) {
        const emojis = Object.values(senders).filter((e): e is string => !!e);
        if (emojis.length > 0) result[targetId] = emojis;
    }
    return result;
}

export async function reactToMessage(ctx: any, messageId: string, emoji: string) {
    if (!ctx.selectedSession) return;
    try {
        await ApiClient.post(`/sessions/${ctx.selectedSession.id}/react`, { messageId, emoji });
        // Reload messages after short delay to reflect the reaction
        setTimeout(() => loadMessages(ctx, true), 1000);
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
