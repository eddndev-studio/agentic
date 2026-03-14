import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { sanitizeToolName } from "../utils/sanitize";
import { isBuiltinTool } from "../core/ai/builtin-tools";

export const toolController = new Elysia({ prefix: "/tools" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // List tools by bot or template
    .get("/", async ({ query }) => {
        const { botId, templateId } = query as any;
        if (templateId) {
            return prisma.tool.findMany({
                where: { templateId },
                orderBy: { createdAt: "desc" },
            });
        }
        if (!botId) return [];
        return prisma.tool.findMany({
            where: { botId },
            orderBy: { createdAt: "desc" },
        });
    })

    // Get single tool
    .get("/:id", async ({ params: { id }, set }) => {
        const tool = await prisma.tool.findUnique({ where: { id } });
        if (!tool) {
            set.status = 404;
            return { error: "Tool not found" };
        }
        return tool;
    })

    // Create tool (for bot or template)
    .post("/", async ({ body, set }) => {
        const { botId, templateId, name, description, parameters, actionType, actionConfig, flowId } = body as any;

        if ((!botId && !templateId) || !name || !description || !actionType) {
            set.status = 400;
            return { error: "botId or templateId, name, description, and actionType are required" };
        }

        const sanitizedName = sanitizeToolName(name);

        if (isBuiltinTool(sanitizedName)) {
            set.status = 409;
            return { error: `Tool name '${sanitizedName}' is reserved (built-in tool).` };
        }

        try {
            const tool = await prisma.tool.create({
                data: {
                    botId: botId || undefined,
                    templateId: templateId || undefined,
                    name: sanitizedName,
                    description,
                    parameters: parameters || { type: "object", properties: {} },
                    actionType,
                    actionConfig: actionConfig || {},
                    flowId: flowId || undefined,
                },
            });
            return tool;
        } catch (e: any) {
            if (e.code === "P2002") {
                set.status = 409;
                return { error: `Tool name '${sanitizedName}' already exists` };
            }
            throw e;
        }
    })

    // Update tool
    .put("/:id", async ({ params: { id }, body, set }) => {
        const { name, description, parameters, actionType, actionConfig, status, flowId } = body as any;

        try {
            const data: any = {};
            if (name !== undefined) {
                const sanitized = sanitizeToolName(name);
                if (isBuiltinTool(sanitized)) {
                    set.status = 409;
                    return { error: `Tool name '${sanitized}' is reserved (built-in tool).` };
                }
                data.name = sanitized;
            }
            if (description !== undefined) data.description = description;
            if (parameters !== undefined) data.parameters = parameters;
            if (actionType !== undefined) data.actionType = actionType;
            if (actionConfig !== undefined) data.actionConfig = actionConfig;
            if (status !== undefined) data.status = status;
            if (flowId !== undefined) data.flowId = flowId || null;

            const tool = await prisma.tool.update({ where: { id }, data });
            return tool;
        } catch (e: any) {
            set.status = 500;
            return { error: "Failed to update tool" };
        }
    })

    // Delete tool
    .delete("/:id", async ({ params: { id }, set }) => {
        try {
            await prisma.tool.delete({ where: { id } });
            return { success: true };
        } catch (e: any) {
            set.status = 500;
            return { error: "Failed to delete tool" };
        }
    })

    // Migrate flow to tool (fallback — auto-sync usually handles this)
    .post("/from-flow/:flowId", async ({ params: { flowId }, set }) => {
        const flow = await prisma.flow.findUnique({
            where: { id: flowId },
            include: { steps: true },
        });

        if (!flow) {
            set.status = 404;
            return { error: "Flow not found" };
        }

        // Return existing tool if already auto-created
        const existing = await prisma.tool.findFirst({
            where: { flowId: flow.id },
        });
        if (existing) return existing;

        const sanitizedName = sanitizeToolName(flow.name);

        try {
            const tool = await prisma.tool.create({
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
            return tool;
        } catch (e: any) {
            if (e.code === "P2002") {
                set.status = 409;
                return { error: `Tool '${sanitizedName}' already exists for this bot` };
            }
            throw e;
        }
    });
