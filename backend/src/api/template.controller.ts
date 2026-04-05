import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { AIProvider } from "@prisma/client";
import { authMiddleware } from "../middleware/auth.middleware";

export const templateController = new Elysia({ prefix: "/templates" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // List all templates
    .get("/", async ({ user }) => {
        return prisma.template.findMany({
            where: { orgId: user!.orgId },
            orderBy: { name: "asc" },
            include: {
                _count: { select: { bots: true, flows: true, tools: true } },
            },
        });
    })

    // Get template by id (with full relations)
    .get("/:id", async ({ params: { id }, set, user }) => {
        const template = await prisma.template.findFirst({
            where: { id, orgId: user!.orgId },
            include: {
                bots: { select: { id: true, name: true, identifier: true } },
                flows: { include: { steps: true, triggers: true } },
                tools: true,
                automations: true,
            },
        });
        if (!template) {
            set.status = 404;
            return { error: "Template not found" };
        }
        return template;
    })

    // Create template
    .post("/", async ({ body, set, user }) => {
        const { name, description, aiModel, aiProvider, systemPrompt, temperature, thinkingLevel } = body;

        try {
            return await prisma.template.create({
                data: {
                    name,
                    description: description ?? null,
                    aiModel: aiModel ?? "gemini-2.5-flash",
                    aiProvider: (aiProvider as AIProvider) ?? "GEMINI",
                    systemPrompt: systemPrompt ?? null,
                    temperature: temperature ?? 0.7,
                    thinkingLevel: thinkingLevel ?? "LOW",
                    orgId: user!.orgId,
                },
            });
        } catch (_e: unknown) {
            set.status = 500;
            return { error: "Failed to create template" };
        }
    }, {
        body: t.Object({
            name: t.String(),
            description: t.Optional(t.String()),
            aiModel: t.Optional(t.String()),
            aiProvider: t.Optional(t.String()),
            systemPrompt: t.Optional(t.String()),
            temperature: t.Optional(t.Number()),
            thinkingLevel: t.Optional(t.String()),
        }),
    })

    // Update template
    .put("/:id", async ({ params: { id }, body, set, user }) => {
        try {
            // Verify template belongs to this org
            const existingTemplate = await prisma.template.findFirst({ where: { id, orgId: user!.orgId } });
            if (!existingTemplate) { set.status = 404; return { error: "Template not found" }; }

            const data: Record<string, unknown> = {};
            if (body.name !== undefined) data.name = body.name;
            if (body.description !== undefined) data.description = body.description;
            if (body.aiEnabled !== undefined) data.aiEnabled = body.aiEnabled;
            if (body.defaultSessionAi !== undefined) data.defaultSessionAi = body.defaultSessionAi;
            if (body.aiModel !== undefined) data.aiModel = body.aiModel;
            if (body.aiProvider !== undefined) data.aiProvider = body.aiProvider as AIProvider;
            if (body.systemPrompt !== undefined) data.systemPrompt = body.systemPrompt;
            if (body.temperature !== undefined) data.temperature = body.temperature;
            if (body.thinkingLevel !== undefined) data.thinkingLevel = body.thinkingLevel;
            if (body.messageDelay !== undefined) data.messageDelay = body.messageDelay;
            if (body.contextMessages !== undefined) data.contextMessages = body.contextMessages;
            if (body.autoReadReceipts !== undefined) data.autoReadReceipts = body.autoReadReceipts;
            if (body.excludeGroups !== undefined) data.excludeGroups = body.excludeGroups;
            if (body.ignoredLabels !== undefined) data.ignoredLabels = body.ignoredLabels;
            if (body.variables !== undefined) data.variables = body.variables;

            return await prisma.template.update({ where: { id }, data });
        } catch (_e: unknown) {
            set.status = 500;
            return { error: "Failed to update template" };
        }
    }, {
        body: t.Object({
            name: t.Optional(t.String()),
            description: t.Optional(t.String()),
            aiEnabled: t.Optional(t.Boolean()),
            defaultSessionAi: t.Optional(t.Boolean()),
            aiModel: t.Optional(t.String()),
            aiProvider: t.Optional(t.String()),
            systemPrompt: t.Optional(t.String()),
            temperature: t.Optional(t.Number()),
            thinkingLevel: t.Optional(t.String()),
            messageDelay: t.Optional(t.Number()),
            contextMessages: t.Optional(t.Number()),
            autoReadReceipts: t.Optional(t.Boolean()),
            excludeGroups: t.Optional(t.Array(t.String())),
            ignoredLabels: t.Optional(t.Array(t.String())),
            variables: t.Optional(t.Any()),
        }),
    })

    // Delete template (bots keep working, templateId becomes null via SetNull)
    .delete("/:id", async ({ params: { id }, set, user }) => {
        try {
            const template = await prisma.template.findFirst({ where: { id, orgId: user!.orgId } });
            if (!template) { set.status = 404; return { error: "Template not found" }; }

            await prisma.template.delete({ where: { id } });
            return { success: true };
        } catch (_e: unknown) {
            set.status = 500;
            return { error: "Failed to delete template" };
        }
    });
