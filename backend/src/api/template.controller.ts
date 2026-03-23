import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { AIProvider } from "@prisma/client";
import { authMiddleware } from "../middleware/auth.middleware";

export const templateController = new Elysia({ prefix: "/templates" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // List all templates
    .get("/", async () => {
        return prisma.template.findMany({
            orderBy: { name: "asc" },
            include: {
                _count: { select: { bots: true, flows: true, tools: true } },
            },
        });
    })

    // Get template by id (with full relations)
    .get("/:id", async ({ params: { id }, set }) => {
        const template = await prisma.template.findUnique({
            where: { id },
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
    .post("/", async ({ body, set }) => {
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
    .put("/:id", async ({ params: { id }, body, set }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia untyped body
        const { name, description, aiEnabled, defaultSessionAi, aiModel, aiProvider, systemPrompt, temperature, thinkingLevel, messageDelay, contextMessages, autoReadReceipts, excludeGroups, ignoredLabels, variables } = body as any;

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma partial update
            const data: any = {};
            if (name !== undefined) data.name = name;
            if (description !== undefined) data.description = description;
            if (aiEnabled !== undefined) data.aiEnabled = aiEnabled;
            if (defaultSessionAi !== undefined) data.defaultSessionAi = defaultSessionAi;
            if (aiModel !== undefined) data.aiModel = aiModel;
            if (aiProvider !== undefined) data.aiProvider = aiProvider as AIProvider;
            if (systemPrompt !== undefined) data.systemPrompt = systemPrompt;
            if (temperature !== undefined) data.temperature = temperature;
            if (thinkingLevel !== undefined) data.thinkingLevel = thinkingLevel;
            if (messageDelay !== undefined) data.messageDelay = messageDelay;
            if (contextMessages !== undefined) data.contextMessages = contextMessages;
            if (autoReadReceipts !== undefined) data.autoReadReceipts = autoReadReceipts;
            if (excludeGroups !== undefined) data.excludeGroups = excludeGroups;
            if (ignoredLabels !== undefined) data.ignoredLabels = ignoredLabels;
            if (variables !== undefined) data.variables = variables;

            return await prisma.template.update({ where: { id }, data });
        } catch (_e: unknown) {
            set.status = 500;
            return { error: "Failed to update template" };
        }
    })

    // Delete template (bots keep working, templateId becomes null via SetNull)
    .delete("/:id", async ({ params: { id }, set }) => {
        try {
            await prisma.template.delete({ where: { id } });
            return { success: true };
        } catch (_e: unknown) {
            set.status = 500;
            return { error: "Failed to delete template" };
        }
    });
