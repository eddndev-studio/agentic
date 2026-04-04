import { ApiClient } from '../api';

export async function syncLabels(ctx: any) {
    ctx.syncingLabels = true;
    try {
        await ApiClient.post(`/sessions/labels/sync`, { botId: ctx.botId });
        await new Promise(r => setTimeout(r, 3000));
        ctx.botLabels = await ApiClient.get(`/sessions/labels?botId=${ctx.botId}`);
    } catch (e) {
        console.error("Failed to sync labels", e);
    } finally {
        ctx.syncingLabels = false;
    }
}

export async function createLabel(ctx: any) {
    if (!ctx.newLabelName.trim()) return;
    ctx.savingLabel = true;
    try {
        await ApiClient.post('/sessions/labels', {
            botId: ctx.botId,
            name: ctx.newLabelName.trim(),
            color: ctx.newLabelColor,
        });
        ctx.botLabels = await ApiClient.get(`/sessions/labels?botId=${ctx.botId}`);
        ctx.newLabelName = '';
        ctx.newLabelColor = 0;
        ctx.creatingLabel = false;
        window.__toast?.success('Etiqueta creada');
    } catch (e: any) {
        window.__toast?.error(e.message || 'Error al crear etiqueta');
    } finally {
        ctx.savingLabel = false;
    }
}

export async function updateLabel(ctx: any) {
    if (!ctx.editingLabel) return;
    ctx.savingLabel = true;
    try {
        await ApiClient.patch(`/sessions/labels/${ctx.editingLabel.id}`, {
            name: ctx.editingLabel.name,
            color: ctx.editingLabel.color,
        });
        ctx.botLabels = await ApiClient.get(`/sessions/labels?botId=${ctx.botId}`);
        ctx.editingLabel = null;
        window.__toast?.success('Etiqueta actualizada');
    } catch (e: any) {
        window.__toast?.error(e.message || 'Error al actualizar etiqueta');
    } finally {
        ctx.savingLabel = false;
    }
}

export async function deleteLabel(ctx: any, labelId: string, labelName: string) {
    if (!confirm(`¿Eliminar etiqueta "${labelName}"? Se removerá de todas las conversaciones.`)) return;
    try {
        await ApiClient.delete(`/sessions/labels/${labelId}`);
        const idx = ctx.aiConfig.ignoredLabels.indexOf(labelId);
        if (idx >= 0) ctx.aiConfig.ignoredLabels.splice(idx, 1);
        ctx.botLabels = await ApiClient.get(`/sessions/labels?botId=${ctx.botId}`);
        window.__toast?.success('Etiqueta eliminada');
    } catch (e: any) {
        window.__toast?.error(e.message || 'Error al eliminar etiqueta');
    }
}

export async function moveLabelUp(ctx: any, labelId: string) {
    const idx = ctx.botLabels.findIndex((l: any) => l.id === labelId);
    if (idx <= 0) return;
    const arr = [...ctx.botLabels];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    ctx.botLabels = arr;
    await ApiClient.put('/sessions/labels/reorder', { labelIds: arr.map((l: any) => l.id) });
}

export async function moveLabelDown(ctx: any, labelId: string) {
    const idx = ctx.botLabels.findIndex((l: any) => l.id === labelId);
    if (idx < 0 || idx >= ctx.botLabels.length - 1) return;
    const arr = [...ctx.botLabels];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    ctx.botLabels = arr;
    await ApiClient.put('/sessions/labels/reorder', { labelIds: arr.map((l: any) => l.id) });
}
