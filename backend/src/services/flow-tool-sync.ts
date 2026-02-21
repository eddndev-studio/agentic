import { prisma } from "./postgres.service";
import { sanitizeToolName } from "../utils/sanitize";

interface FlowLike {
    id: string;
    botId: string;
    name: string;
    description?: string | null;
}

/**
 * Upsert a Tool linked to a Flow.
 * Looks up by flowId (not name) so renames are handled correctly.
 * Captures P2002 (unique constraint on botId+name) as a warning.
 */
export async function syncFlowTool(flow: FlowLike): Promise<void> {
    const sanitizedName = sanitizeToolName(flow.name);

    try {
        const existing = await prisma.tool.findFirst({
            where: { flowId: flow.id },
        });

        if (existing) {
            await prisma.tool.update({
                where: { id: existing.id },
                data: {
                    name: sanitizedName,
                    description: flow.description || `Ejecuta el flujo '${flow.name}'.`,
                },
            });
        } else {
            await prisma.tool.create({
                data: {
                    botId: flow.botId,
                    name: sanitizedName,
                    description: flow.description || `Ejecuta el flujo '${flow.name}'.`,
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
                `[flow-tool-sync] Name collision: '${sanitizedName}' already exists for bot ${flow.botId}. Flow '${flow.name}' will not have an auto-generated tool.`
            );
        } else {
            console.error(`[flow-tool-sync] Error syncing tool for flow ${flow.id}:`, e);
        }
    }
}
