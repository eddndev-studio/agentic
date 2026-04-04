import { ApiClient } from '../api';

export async function loadAutomations(ctx: any) {
    try {
        ctx.automations = await ApiClient.get(`/bots/${ctx.botId}/automations`);
    } catch (e) {
        console.error("Failed to load automations", e);
    }
}

export function openCreateAutomation(ctx: any) {
    ctx.editingAutomationId = null;
    ctx.automationForm = { name: "", event: "INACTIVITY", labelName: "", timeoutValue: 3, timeoutUnit: "days", prompt: "" };
    ctx.showAutomationModal = true;
}

export function editAutomation(ctx: any, auto: any) {
    ctx.editingAutomationId = auto.id;
    const ms = auto.timeoutMs;
    let timeoutValue: number;
    let timeoutUnit: string;
    if (ms >= 86400000 && ms % 86400000 === 0) {
        timeoutValue = ms / 86400000;
        timeoutUnit = "days";
    } else if (ms >= 3600000 && ms % 3600000 === 0) {
        timeoutValue = ms / 3600000;
        timeoutUnit = "hours";
    } else {
        timeoutValue = ms / 60000;
        timeoutUnit = "minutes";
    }
    ctx.automationForm = {
        name: auto.name,
        event: auto.event,
        labelName: auto.labelName || "",
        timeoutValue,
        timeoutUnit,
        prompt: auto.prompt,
    };
    ctx.showAutomationModal = true;
}

export async function saveAutomation(ctx: any) {
    const timeoutMs = ctx.automationForm.timeoutUnit === "days"
        ? ctx.automationForm.timeoutValue * 24 * 60 * 60 * 1000
        : ctx.automationForm.timeoutUnit === "hours"
        ? ctx.automationForm.timeoutValue * 60 * 60 * 1000
        : ctx.automationForm.timeoutValue * 60 * 1000;

    const payload = {
        name: ctx.automationForm.name,
        event: ctx.automationForm.event,
        labelName: ctx.automationForm.labelName || null,
        timeoutMs,
        prompt: ctx.automationForm.prompt,
    };

    try {
        if (ctx.editingAutomationId) {
            await ApiClient.put(`/bots/${ctx.botId}/automations/${ctx.editingAutomationId}`, payload);
        } else {
            await ApiClient.post(`/bots/${ctx.botId}/automations`, payload);
        }
        ctx.showAutomationModal = false;
        ctx.automationForm = { name: "", event: "INACTIVITY", labelName: "", timeoutValue: 3, timeoutUnit: "days", prompt: "" };
        ctx.editingAutomationId = null;
        await loadAutomations(ctx);
        window.__toast.success("Automatización guardada");
    } catch (e: any) {
        window.__toast.error("Failed: " + (e.message || "Unknown error"));
    }
}

export async function toggleAutomation(ctx: any, autoId: string, enabled: boolean) {
    try {
        await ApiClient.put(`/bots/${ctx.botId}/automations/${autoId}`, { enabled });
        await loadAutomations(ctx);
    } catch (e: any) {
        window.__toast.error("Failed: " + (e.message || "Unknown error"));
    }
}

export async function deleteAutomation(ctx: any, autoId: string) {
    if (!confirm(ctx.$t('delete_confirm') || 'Are you sure?')) return;
    try {
        await ApiClient.delete(`/bots/${ctx.botId}/automations/${autoId}`);
        await loadAutomations(ctx);
    } catch (e: any) {
        window.__toast.error("Failed: " + (e.message || "Unknown error"));
    }
}
