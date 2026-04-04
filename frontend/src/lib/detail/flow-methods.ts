import { ApiClient } from '../api';

export async function deleteFlow(ctx: any, flowId: string, flowName: string) {
    if (!confirm(ctx.$t('delete_flow_confirm') || `Delete flow "${flowName}"?`)) return;
    try {
        await ApiClient.delete(`/flows/${flowId}`);
        ctx.flows = await ApiClient.get(`/flows?botId=${ctx.botId}`);
        window.__toast.success("Flujo eliminado");
    } catch (e: any) {
        window.__toast.error("Failed to delete flow: " + (e.message || "Unknown error"));
    }
}

export async function openImportModal(ctx: any) {
    ctx.showImportModal = true;
    ctx.importData = { sourceBotId: "", sourceFlowId: "" };
    ctx.sourceFlows = [];

    try {
        ctx.sourceBots = await ApiClient.get("/bots");
    } catch (e) {
        console.error("Failed to load bots", e);
    }
}

export async function loadSourceFlows(ctx: any) {
    if (!ctx.importData.sourceBotId) {
        ctx.sourceFlows = [];
        return;
    }
    try {
        ctx.sourceFlows = await ApiClient.get(
            `/flows?botId=${ctx.importData.sourceBotId}`,
        );
    } catch (e) {
        console.error("Failed to load flows", e);
    }
}

export async function importFlow(ctx: any) {
    if (!ctx.importData.sourceFlowId) return;

    ctx.loadingImport = true;
    try {
        await ApiClient.post("/flows/import", {
            sourceFlowId: ctx.importData.sourceFlowId,
            targetBotId: ctx.botId,
        });

        ctx.showImportModal = false;
        ctx.flows = await ApiClient.get(`/flows?botId=${ctx.botId}`);
        window.__toast.success("Flujo importado");
    } catch (e: any) {
        window.__toast.error("Import failed: " + (e.message || "Unknown error"));
    } finally {
        ctx.loadingImport = false;
    }
}

export async function exportFlowsJson(ctx: any) {
    try {
        const data = await ApiClient.get(`/flows/export?botId=${ctx.botId}`);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `flows-${ctx.bot.name || ctx.botId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        window.__toast.success(`${data.flows.length} flujo(s) exportado(s)`);
    } catch (e: any) {
        window.__toast.error("Export failed: " + (e.message || "Unknown error"));
    }
}

export async function importFlowsJson(ctx: any, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const flows = data.flows || data;
        if (!Array.isArray(flows) || flows.length === 0) {
            window.__toast.error("El archivo no contiene flujos válidos");
            return;
        }
        if (!confirm(`Importar ${flows.length} flujo(s)?`)) return;
        const result = await ApiClient.post("/flows/import-json", {
            botId: ctx.botId,
            flows,
        });
        ctx.flows = await ApiClient.get(`/flows?botId=${ctx.botId}`);
        window.__toast.success(`${result.imported} flujo(s) importado(s)`);
    } catch (e: any) {
        window.__toast.error("Import failed: " + (e.message || "Unknown error"));
    } finally {
        input.value = "";
    }
}
