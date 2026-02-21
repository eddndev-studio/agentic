/**
 * One-time script: Generate tools for all flows that don't have a linked tool.
 *
 * Usage: npx tsx scripts/sync-flow-tools.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function sanitizeToolName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

async function main() {
    const flows = await prisma.flow.findMany({
        where: { tools: { none: {} } },
    });

    console.log(`Found ${flows.length} flow(s) without a linked tool.`);

    let created = 0;
    let skipped = 0;

    for (const flow of flows) {
        const sanitizedName = sanitizeToolName(flow.name);

        try {
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
            created++;
            console.log(`  [OK] ${flow.name} -> ${sanitizedName}`);
        } catch (e: any) {
            if (e.code === "P2002") {
                skipped++;
                console.warn(`  [SKIP] ${flow.name}: name '${sanitizedName}' already taken`);
            } else {
                console.error(`  [ERR] ${flow.name}:`, e.message);
            }
        }
    }

    console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
