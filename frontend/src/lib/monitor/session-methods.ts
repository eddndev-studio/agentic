import { ApiClient } from '../api';

export function buildSessionParams(ctx: any): URLSearchParams {
    const params = new URLSearchParams();
    if (ctx.botId) params.append("botId", ctx.botId);
    if (ctx.searchQuery) params.append("search", ctx.searchQuery);
    if (ctx.filterLabelId) params.append("labelId", ctx.filterLabelId);
    params.append("limit", String(ctx.sessionLimit));
    return params;
}

export async function loadSessions(ctx: any) {
    ctx.sessionOffset = 0;
    try {
        const params = buildSessionParams(ctx);
        params.append("offset", "0");
        const res = await ApiClient.get(`/sessions?${params.toString()}`);
        ctx.sessions = res.data || [];
        ctx.totalSessions = res.pagination?.total || 0;
        ctx.hasMoreSessions = ctx.sessions.length < ctx.totalSessions;
    } catch (e) { console.error("Failed to load sessions", e); }
}

export async function loadMoreSessions(ctx: any) {
    if (ctx.loadingMoreSessions || !ctx.hasMoreSessions) return;
    ctx.loadingMoreSessions = true;
    try {
        ctx.sessionOffset += ctx.sessionLimit;
        const params = buildSessionParams(ctx);
        params.append("offset", String(ctx.sessionOffset));
        const res = await ApiClient.get(`/sessions?${params.toString()}`);
        const newSessions = res.data || [];
        const existingIds = new Set(ctx.sessions.map((s: any) => s.id));
        for (const s of newSessions) { if (!existingIds.has(s.id)) ctx.sessions.push(s); }
        ctx.totalSessions = res.pagination?.total || ctx.totalSessions;
        ctx.hasMoreSessions = ctx.sessions.length < ctx.totalSessions;
    } catch (e) {
        console.error("Failed to load more sessions", e);
        ctx.sessionOffset -= ctx.sessionLimit;
    } finally { ctx.loadingMoreSessions = false; }
}

export function onSessionsScroll(ctx: any, e: Event) {
    const el = e.target as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) loadMoreSessions(ctx);
}

export async function selectSession(ctx: any, session: any) {
    ctx.selectedSession = session;
    ctx.unreadCounts[session.id] = 0;
    ctx.sessionNotes = session.notes || '';
    ctx.showNotesPanel = false;
    ctx.messages = [];
    ctx.hasMoreMessages = true;
    ctx.loadingMore = false;
    const { loadMessages } = await import('./message-methods');
    await loadMessages(ctx);
    ApiClient.post(`/sessions/${session.id}/mark-read`, {}).catch(() => {});
}
