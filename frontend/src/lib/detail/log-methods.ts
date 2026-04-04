import { ApiClient } from '../api';

export async function loadTools(ctx: any) {
    try {
        ctx.tools = await ApiClient.get(`/tools?botId=${ctx.botId}`);
    } catch (e) {
        console.error("Failed to load tools", e);
    }
}

export async function convertFlowToTool(ctx: any, flowId: string) {
    try {
        await ApiClient.post(`/tools/from-flow/${flowId}`, {});
        await loadTools(ctx);
        window.__toast.success("Flow converted to tool!");
    } catch (e: any) {
        window.__toast.error("Failed: " + (e.message || "Unknown error"));
    }
}

export async function loadLogs(ctx: any) {
    ctx.loadingLogs = true;
    try {
        const params = new URLSearchParams();
        params.append("botId", ctx.botId!);
        params.append("limit", String(ctx.logsPagination.limit));
        params.append("offset", String(ctx.logsPagination.offset));
        if (ctx.filters.status !== "ALL")
            params.append("status", ctx.filters.status);
        if (ctx.filters.search)
            params.append("search", ctx.filters.search);
        if (ctx.filters.startDate)
            params.append("startDate", ctx.filters.startDate);
        if (ctx.filters.endDate)
            params.append("endDate", ctx.filters.endDate);

        const res = await ApiClient.get(
            `/executions?${params.toString()}`,
        );
        ctx.logs = res.data;
        ctx.logsPagination = {
            ...ctx.logsPagination,
            total: res.pagination.total,
        };
    } catch (e) {
        console.error("Failed to load logs", e);
    } finally {
        ctx.loadingLogs = false;
    }
}

export function prevPage(ctx: any) {
    if (ctx.logsPagination.offset > 0) {
        ctx.logsPagination.offset = Math.max(
            0,
            ctx.logsPagination.offset - ctx.logsPagination.limit,
        );
        loadLogs(ctx);
    }
}

export function nextPage(ctx: any) {
    if (
        ctx.logsPagination.offset + ctx.logsPagination.limit <
        ctx.logsPagination.total
    ) {
        ctx.logsPagination.offset += ctx.logsPagination.limit;
        loadLogs(ctx);
    }
}
