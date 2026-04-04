import { ApiClient } from '../api';

export async function togglePause(ctx: any) {
    try {
        const updated = await ApiClient.put(`/bots/${ctx.botId}`, {
            paused: !ctx.bot.paused,
        });
        ctx.bot = updated;
    } catch (e: any) {
        window.__toast.error("Failed to toggle pause: " + (e.message || "Unknown error"));
    }
}

export async function deleteBot(ctx: any) {
    const confirmed = confirm(
        "Delete this bot? This will also delete all associated flows.",
    );
    if (!confirmed) return;

    try {
        await ApiClient.delete(`/bots/${ctx.botId}`);
        window.location.href = "/bots";
    } catch (e: any) {
        window.__toast.error(e.message || "Failed to delete bot");
    }
}

export function editBot(ctx: any) {
    ctx.editForm.name = ctx.bot.name;
    ctx.editForm.identifier = ctx.bot.identifier;
    ctx.showEditModal = true;
}

export async function submitEditBot(ctx: any) {
    if (!ctx.editForm.name || !ctx.editForm.identifier) return;

    ctx.savingEdit = true;
    try {
        const updated = await ApiClient.put(`/bots/${ctx.botId}`, {
            name: ctx.editForm.name,
            identifier: ctx.editForm.identifier,
            platform: ctx.bot.platform,
        });
        ctx.bot = updated;
        ctx.showEditModal = false;
        window.__toast.success("Bot actualizado");
    } catch (e: any) {
        window.__toast.error(e.message || "Failed to update bot");
    } finally {
        ctx.savingEdit = false;
    }
}

export function cloneBot(ctx: any) {
    ctx.cloneForm.name = `${ctx.bot.name} (Copy)`;
    ctx.cloneForm.identifier = "";
    ctx.showCloneModal = true;
}

export async function submitCloneBot(ctx: any) {
    if (!ctx.cloneForm.name || !ctx.cloneForm.identifier) return;

    ctx.savingClone = true;
    try {
        const newBot = await ApiClient.post(`/bots/${ctx.botId}/clone`, {
            name: ctx.cloneForm.name,
            identifier: ctx.cloneForm.identifier,
        });
        window.location.href = `/bots/detail?id=${newBot.id}`;
    } catch (e: any) {
        window.__toast.error(e.message || "Failed to clone bot");
    } finally {
        ctx.savingClone = false;
    }
}

export async function generatePublicLink(ctx: any) {
    try {
        const res = await ApiClient.post(`/bots/${ctx.botId}/generate-link`, {});
        const frontendUrl = window.location.origin;
        ctx.publicLink = `${frontendUrl}${res.link}`;
        ctx.linkCopied = false;
        ctx.showLinkModal = true;
    } catch (e: any) {
        window.__toast?.error(e.message || 'Failed to generate link');
    }
}

export async function copyPublicLink(ctx: any) {
    try {
        await navigator.clipboard.writeText(ctx.publicLink);
        ctx.linkCopied = true;
        window.__toast?.success(ctx.$t('link_copied'));
        setTimeout(() => { ctx.linkCopied = false; }, 2000);
    } catch {
        // Fallback: select the input
    }
}
