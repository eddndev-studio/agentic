import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { sanitizeToolName } from "../utils/sanitize";
import { isBuiltinTool } from "../core/ai/builtin-tools";
import { handlePrismaError } from "../utils/prisma-errors";

export const toolController = new Elysia({ prefix: "/tools" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // List tools by bot or template
    .get("/", async ({ query, user }) => {
        const { botId, templateId } = query as { botId?: string; templateId?: string };
        if (templateId) {
            return prisma.tool.findMany({
                where: { templateId, template: { orgId: user!.orgId } },
                orderBy: { createdAt: "desc" },
            });
        }
        if (!botId) return [];
        return prisma.tool.findMany({
            where: { botId, bot: { orgId: user!.orgId } },
            orderBy: { createdAt: "desc" },
        });
    })

    // Get single tool
    .get("/:id", async ({ params: { id }, set, user }) => {
        const tool = await prisma.tool.findFirst({
            where: {
                id,
                OR: [
                    { bot: { orgId: user!.orgId } },
                    { template: { orgId: user!.orgId } },
                ],
            },
        });
        if (!tool) {
            set.status = 404;
            return { error: "Tool not found" };
        }
        return tool;
    })

    // Create tool (for bot or template)
    .post("/", async ({ body, set, user }) => {
        if ((!body.botId && !body.templateId)) {
            set.status = 400;
            return { error: "botId or templateId is required" };
        }

        // Verify parent belongs to org
        if (body.templateId) {
            const tmpl = await prisma.template.findFirst({ where: { id: body.templateId, orgId: user!.orgId } });
            if (!tmpl) { set.status = 403; return { error: "Template not found or not in your organization" }; }
        } else if (body.botId) {
            const bot = await prisma.bot.findFirst({ where: { id: body.botId, orgId: user!.orgId } });
            if (!bot) { set.status = 403; return { error: "Bot not found or not in your organization" }; }
        }

        const sanitizedName = sanitizeToolName(body.name);

        if (isBuiltinTool(sanitizedName)) {
            set.status = 409;
            return { error: `Tool name '${sanitizedName}' is reserved (built-in tool).` };
        }

        try {
            const tool = await prisma.tool.create({
                data: {
                    botId: body.botId || undefined,
                    templateId: body.templateId || undefined,
                    name: sanitizedName,
                    description: body.description,
                    parameters: body.parameters || { type: "object", properties: {} },
                    actionType: body.actionType,
                    actionConfig: body.actionConfig || {},
                    flowId: body.flowId || undefined,
                },
            });
            return tool;
        } catch (e: unknown) {
            if (e instanceof Error && 'code' in e && (e as Record<string, unknown>).code === "P2002") {
                set.status = 409;
                return { error: `Tool name '${sanitizedName}' already exists` };
            }
            throw e;
        }
    }, {
        body: t.Object({
            botId: t.Optional(t.String()),
            templateId: t.Optional(t.String()),
            name: t.String(),
            description: t.String(),
            actionType: t.String(),
            parameters: t.Optional(t.Any()),
            actionConfig: t.Optional(t.Any()),
            flowId: t.Optional(t.String()),
        }),
    })

    // Update tool
    .put("/:id", async ({ params: { id }, body, set, user }) => {
        // Verify tool belongs to org
        const existing = await prisma.tool.findFirst({
            where: {
                id,
                OR: [
                    { bot: { orgId: user!.orgId } },
                    { template: { orgId: user!.orgId } },
                ],
            },
        });
        if (!existing) {
            set.status = 404;
            return { error: "Tool not found" };
        }

        try {
            const data: Record<string, unknown> = {};
            if (body.name !== undefined) {
                const sanitized = sanitizeToolName(body.name);
                if (isBuiltinTool(sanitized)) {
                    set.status = 409;
                    return { error: `Tool name '${sanitized}' is reserved (built-in tool).` };
                }
                data.name = sanitized;
            }
            if (body.description !== undefined) data.description = body.description;
            if (body.parameters !== undefined) data.parameters = body.parameters;
            if (body.actionType !== undefined) data.actionType = body.actionType;
            if (body.actionConfig !== undefined) data.actionConfig = body.actionConfig;
            if (body.status !== undefined) data.status = body.status;
            if (body.flowId !== undefined) data.flowId = body.flowId || null;

            const tool = await prisma.tool.update({ where: { id }, data });
            return tool;
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Tool");
            set.status = status;
            return body;
        }
    }, {
        body: t.Object({
            name: t.Optional(t.String()),
            description: t.Optional(t.String()),
            parameters: t.Optional(t.Any()),
            actionType: t.Optional(t.String()),
            actionConfig: t.Optional(t.Any()),
            status: t.Optional(t.String()),
            flowId: t.Optional(t.String()),
        }),
    })

    // Delete tool
    .delete("/:id", async ({ params: { id }, set, user }) => {
        // Verify tool belongs to org
        const existing = await prisma.tool.findFirst({
            where: {
                id,
                OR: [
                    { bot: { orgId: user!.orgId } },
                    { template: { orgId: user!.orgId } },
                ],
            },
        });
        if (!existing) {
            set.status = 404;
            return { error: "Tool not found" };
        }

        try {
            await prisma.tool.delete({ where: { id } });
            return { success: true };
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Tool");
            set.status = status;
            return body;
        }
    })

    // Migrate flow to tool (fallback -- auto-sync usually handles this)
    .post("/from-flow/:flowId", async ({ params: { flowId }, set, user }) => {
        // Verify flow belongs to org
        const flow = await prisma.flow.findFirst({
            where: {
                id: flowId,
                OR: [
                    { bot: { orgId: user!.orgId } },
                    { template: { orgId: user!.orgId } },
                ],
            },
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
        } catch (e: unknown) {
            if (e instanceof Error && 'code' in e && (e as Record<string, unknown>).code === "P2002") {
                set.status = 409;
                return { error: `Tool '${sanitizedName}' already exists for this bot` };
            }
            throw e;
        }
    });
