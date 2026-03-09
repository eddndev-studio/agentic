import { prisma } from "./postgres.service";
import { sanitizeToolName } from "../utils/sanitize";

interface FlowLike {
    id: string;
    botId: string;
    name: string;
    description?: string | null;
}

/** Generate a short random hex salt (4 chars). */
function randomSalt(): string {
    return Math.random().toString(16).slice(2, 6);
}

/**
 * Find a unique tool name for the given bot.
 * If the base name is already taken (by a different flow's tool), append a random salt.
 */
async function resolveUniqueName(botId: string, baseName: string, flowId: string): Promise<string> {
    const conflict = await prisma.tool.findFirst({
        where: { botId, name: baseName, NOT: { flowId } },
    });
    if (!conflict) return baseName;

    // Append salt and retry (up to 5 attempts)
    for (let i = 0; i < 5; i++) {
        const candidate = `${baseName}_${randomSalt()}`;
        const exists = await prisma.tool.findFirst({
            where: { botId, name: candidate },
        });
        if (!exists) return candidate;
    }

    // Fallback: use flow id fragment
    return `${baseName}_${flowId.slice(0, 8).replace(/-/g, "")}`;
}

/**
 * Upsert a Tool linked to a Flow.
 * Looks up by flowId (not name) so renames are handled correctly.
 * When name collides with another flow's tool, appends a random salt.
 */
export async function syncFlowTool(flow: FlowLike): Promise<void> {
    const baseName = sanitizeToolName(flow.name);
    const description = flow.description || `Ejecuta el flujo '${flow.name}'.`;

    try {
        const existing = await prisma.tool.findFirst({
            where: { flowId: flow.id },
        });

        if (existing) {
            const uniqueName = await resolveUniqueName(flow.botId, baseName, flow.id);
            await prisma.tool.update({
                where: { id: existing.id },
                data: { name: uniqueName, description },
            });
        } else {
            const uniqueName = await resolveUniqueName(flow.botId, baseName, flow.id);
            await prisma.tool.create({
                data: {
                    botId: flow.botId,
                    name: uniqueName,
                    description,
                    parameters: { type: "object", properties: {} },
                    actionType: "FLOW",
                    actionConfig: { flowId: flow.id },
                    flowId: flow.id,
                },
            });
        }
    } catch (e: any) {
        if (e.code === "P2002") {
            console.warn(
                `[flow-tool-sync] Name collision: '${baseName}' could not be resolved for bot ${flow.botId}.`
            );
        } else {
            console.error(`[flow-tool-sync] Error syncing tool for flow ${flow.id}:`, e);
        }
    }
}
