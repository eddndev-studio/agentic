import { ApiClient } from '../api';

export async function loadDebugContext(ctx: any) {
    if (!ctx.selectedSession) return;
    ctx.loadingDebug = true;
    ctx.showDebugPanel = true;
    try {
        ctx.debugData = await ApiClient.get(`/sessions/${ctx.selectedSession.id}/ai-context`);
    } catch (e: any) {
        (window as any).__toast?.error("Failed to load debug data: " + (e.message || "Unknown"));
    } finally { ctx.loadingDebug = false; }
}

export async function saveNotes(ctx: any) {
    if (!ctx.selectedSession) return;
    try {
        await ApiClient.patch(`/sessions/${ctx.selectedSession.id}/notes`, { notes: ctx.sessionNotes });
        ctx.selectedSession.notes = ctx.sessionNotes;
        const s = ctx.sessions.find((s: any) => s.id === ctx.selectedSession.id);
        if (s) s.notes = ctx.sessionNotes;
    } catch { (window as any).__toast?.error("Failed to save notes"); }
}

export async function toggleAI(ctx: any) {
    if (!ctx.selectedSession) return;
    const newValue = !ctx.selectedSession.aiEnabled;
    try {
        await ApiClient.patch(`/sessions/${ctx.selectedSession.id}/ai-enabled`, { enabled: newValue });
        ctx.selectedSession.aiEnabled = newValue;
        const s = ctx.sessions.find((s: any) => s.id === ctx.selectedSession.id);
        if (s) s.aiEnabled = newValue;
        (window as any).__toast?.info(newValue ? 'IA activada' : 'IA desactivada');
    } catch { (window as any).__toast?.error("Failed to toggle AI"); }
}

export async function forceAI(ctx: any) {
    if (!ctx.selectedSession) return;
    try {
        await ApiClient.post(`/sessions/${ctx.selectedSession.id}/force-ai`, { context: ctx.forceAIContext || undefined });
        ctx.showForceAIModal = false;
        ctx.forceAIContext = "";
        const { loadMessages } = await import('./message-methods');
        setTimeout(() => loadMessages(ctx, true), 2000);
    } catch (e: any) { (window as any).__toast?.error("Force AI failed: " + (e.message || "Unknown error")); }
}

export async function openFlowModal(ctx: any) {
    if (!ctx.botId) return;
    try { ctx.flows = await ApiClient.get(`/flows?botId=${ctx.botId}`); } catch {}
    ctx.selectedFlowId = "";
    ctx.showFlowModal = true;
}

export async function executeFlow(ctx: any) {
    if (!ctx.selectedSession || !ctx.selectedFlowId) return;
    try {
        await ApiClient.post(`/sessions/${ctx.selectedSession.id}/execute-flow`, { flowId: ctx.selectedFlowId });
        ctx.showFlowModal = false;
        const { loadMessages } = await import('./message-methods');
        setTimeout(() => loadMessages(ctx, true), 2000);
    } catch (e: any) { (window as any).__toast?.error("Execute flow failed: " + (e.message || "Unknown error")); }
}

export async function openToolModal(ctx: any) {
    if (!ctx.botId) return;
    try { ctx.tools = await ApiClient.get(`/tools?botId=${ctx.botId}`); } catch {}
    ctx.selectedToolName = "";
    ctx.toolArgsJson = "{}";
    ctx.showToolModal = true;
}

export async function executeTool(ctx: any) {
    if (!ctx.selectedSession || !ctx.selectedToolName) return;
    let args: Record<string, any> = {};
    try { args = JSON.parse(ctx.toolArgsJson); } catch {
        (window as any).__toast?.error("Invalid JSON in arguments"); return;
    }
    try {
        const res = await ApiClient.post(`/sessions/${ctx.selectedSession.id}/execute-tool`, { toolName: ctx.selectedToolName, args });
        ctx.showToolModal = false;
        (window as any).__toast?.info("Tool result: " + JSON.stringify(res.result, null, 2));
    } catch (e: any) { (window as any).__toast?.error("Execute tool failed: " + (e.message || "Unknown error")); }
}

export async function loadLabels(ctx: any) {
    if (!ctx.botId) return;
    try { ctx.botLabels = await ApiClient.get(`/sessions/labels?botId=${ctx.botId}`); }
    catch (e) { console.error("Failed to load labels", e); }
}

export async function assignLabel(ctx: any, labelId: string) {
    if (!ctx.selectedSession) return;
    try {
        await ApiClient.post(`/sessions/${ctx.selectedSession.id}/labels`, { labelId });
        const label = ctx.botLabels.find((l: any) => l.id === labelId);
        if (label) {
            if (!ctx.selectedSession.labels) ctx.selectedSession.labels = [];
            ctx.selectedSession.labels.push({ id: label.id, name: label.name, color: label.color, waLabelId: label.waLabelId });
            const s = ctx.sessions.find((s: any) => s.id === ctx.selectedSession.id);
            if (s) s.labels = [...ctx.selectedSession.labels];
        }
    } catch (e: any) { (window as any).__toast?.error("Assign label failed: " + (e.message || "Unknown error")); }
}

export async function removeLabel(ctx: any, labelId: string) {
    if (!ctx.selectedSession) return;
    try {
        await ApiClient.delete(`/sessions/${ctx.selectedSession.id}/labels/${labelId}`);
        ctx.selectedSession.labels = (ctx.selectedSession.labels || []).filter((l: any) => l.id !== labelId);
        const s = ctx.sessions.find((s: any) => s.id === ctx.selectedSession.id);
        if (s) s.labels = [...ctx.selectedSession.labels];
    } catch (e: any) { (window as any).__toast?.error("Remove label failed: " + (e.message || "Unknown error")); }
}

export function availableLabels(ctx: any): any[] {
    if (!ctx.selectedSession) return [];
    const assignedIds = new Set((ctx.selectedSession.labels || []).map((l: any) => l.id));
    return ctx.botLabels.filter((l: any) => !assignedIds.has(l.id));
}
