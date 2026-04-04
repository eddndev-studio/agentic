import { ApiClient } from '../api';

export async function saveAIConfig(ctx: any) {
    ctx.savingAI = true;
    try {
        const updated = await ApiClient.put(`/bots/${ctx.botId}`, {
            aiEnabled: ctx.aiConfig.aiEnabled,
            aiProvider: ctx.aiConfig.aiProvider,
            aiModel: ctx.aiConfig.aiModel,
            systemPrompt: ctx.aiConfig.systemPrompt || null,
            temperature: ctx.aiConfig.temperature,
            thinkingLevel: ctx.aiConfig.aiProvider === "GEMINI" ? ctx.aiConfig.thinkingLevel : null,
            messageDelay: ctx.aiConfig.messageDelay,
            contextMessages: ctx.aiConfig.contextMessages,
            autoReadReceipts: ctx.aiConfig.autoReadReceipts,
            excludeGroups: ctx.aiConfig.excludeGroups,
            ignoredLabels: ctx.aiConfig.ignoredLabels,
        });
        ctx.bot = updated;
        window.__toast.success("AI config saved!");
    } catch (e: any) {
        window.__toast.error("Failed to save AI config: " + (e.message || "Unknown error"));
    } finally {
        ctx.savingAI = false;
    }
}

export async function clearConversations(ctx: any) {
    if (!confirm(ctx.$t('clear_conversations_confirm') || 'Clear all AI conversation history?')) return;
    try {
        await ApiClient.post(`/bots/${ctx.botId}/clear-conversations`, {});
        window.__toast.success(ctx.$t('conversations_cleared') || 'Conversations cleared');
    } catch (e: any) {
        window.__toast.error("Failed: " + (e.message || "Unknown error"));
    }
}

export function toggleIgnoredLabel(ctx: any, labelId: string) {
    const idx = ctx.aiConfig.ignoredLabels.indexOf(labelId);
    if (idx >= 0) {
        ctx.aiConfig.ignoredLabels.splice(idx, 1);
    } else {
        ctx.aiConfig.ignoredLabels.push(labelId);
    }
}

// --- Notification methods ---

export async function loadNotifSessions(ctx: any) {
    try {
        const sessData = await ApiClient.get(`/sessions?botId=${ctx.botId}`);
        ctx.notifSessions = sessData.data || sessData || [];
    } catch (e) {
        console.error("Failed to load sessions", e);
    }
}

export function addNotifChannel(ctx: any, sessionId: string) {
    if (ctx.notificationChannels.some((c: any) => c.sessionId === sessionId)) return;
    const sess = ctx.notifSessions.find((s: any) => s.id === sessionId);
    ctx.notificationChannels.push({
        sessionId,
        events: ['flow:completed', 'flow:failed', 'session:created', 'session:labels:add', 'session:labels:remove', 'bot:connected', 'bot:disconnected', 'tool:executed'],
        labels: [],
        nickname: '',
        _name: sess?.name || sess?.identifier || sessionId,
    });
    ctx.notifSessions = [];
}

export function removeNotifChannel(ctx: any, index: number) {
    ctx.notificationChannels.splice(index, 1);
}

export function toggleChannelEvent(ctx: any, channelIdx: number, eventType: string) {
    const ch = ctx.notificationChannels[channelIdx];
    const idx = ch.events.indexOf(eventType);
    if (idx >= 0) ch.events.splice(idx, 1);
    else ch.events.push(eventType);
}

export function toggleChannelLabel(ctx: any, channelIdx: number, labelId: string) {
    const ch = ctx.notificationChannels[channelIdx];
    const idx = ch.labels.indexOf(labelId);
    if (idx >= 0) ch.labels.splice(idx, 1);
    else ch.labels.push(labelId);
}

export async function saveNotifications(ctx: any) {
    ctx.savingNotifications = true;
    try {
        const channelsToSave = ctx.notificationChannels.map((ch: any) => ({
            sessionId: ch.sessionId,
            events: ch.events,
            labels: ch.labels,
            nickname: ch.nickname || '',
        }));
        const updated = await ApiClient.put(`/bots/${ctx.botId}`, {
            notificationChannels: channelsToSave,
        });
        ctx.bot = updated;
        window.__toast.success("Notificaciones guardadas!");
    } catch (e: any) {
        window.__toast.error("Error al guardar: " + (e.message || "Unknown error"));
    } finally {
        ctx.savingNotifications = false;
    }
}
