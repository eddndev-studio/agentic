import { prisma } from "./postgres.service";
import type { Bot, Template, Tool, Trigger, TriggerScope } from "@prisma/client";

type BotWithTemplate = Bot & { template: Template | null };
type ThinkingLevel = "LOW" | "MEDIUM" | "HIGH";

interface AIConfig {
    aiModel: string;
    aiProvider: string;
    systemPrompt: string | null;
    temperature: number;
    thinkingLevel: ThinkingLevel;
}

export class BotConfigService {

    /**
     * Loads a bot with its template relation.
     */
    static async loadBot(botId: string): Promise<BotWithTemplate | null> {
        return prisma.bot.findUnique({
            where: { id: botId },
            include: { template: true },
        });
    }

    /**
     * Resolves AI configuration. Uses template config if available, otherwise bot's own.
     */
    static resolveAIConfig(bot: BotWithTemplate): AIConfig {
        const source = bot.template ?? bot;
        return {
            aiModel: source.aiModel,
            aiProvider: source.aiProvider as string,
            systemPrompt: source.systemPrompt,
            temperature: source.temperature,
            thinkingLevel: (source.thinkingLevel as ThinkingLevel) ?? "LOW",
        };
    }

    /**
     * Resolves active tools. Template bots use template's tools; standalone bots use their own.
     */
    static async resolveTools(bot: BotWithTemplate): Promise<Tool[]> {
        if (bot.templateId) {
            return prisma.tool.findMany({
                where: { templateId: bot.templateId, status: "ACTIVE" },
            });
        }
        return prisma.tool.findMany({
            where: { botId: bot.id, status: "ACTIVE" },
        });
    }

    /**
     * Resolves a single tool by name. Searches template tools first if applicable.
     */
    static async resolveTool(bot: BotWithTemplate, toolName: string): Promise<Tool | null> {
        if (bot.templateId) {
            return prisma.tool.findFirst({
                where: { templateId: bot.templateId, name: toolName, status: "ACTIVE" },
            });
        }
        return prisma.tool.findFirst({
            where: { botId: bot.id, name: toolName, status: "ACTIVE" },
        });
    }

    /**
     * Resolves active triggers. Combines template triggers (if any) with
     * bot-level and session-specific triggers.
     */
    static async resolveTriggers(
        bot: BotWithTemplate,
        sessionId: string | null,
        scopes: TriggerScope[]
    ): Promise<(Trigger & { flow: any })[]> {
        const conditions: any[] = [];

        if (bot.templateId) {
            conditions.push({ templateId: bot.templateId, sessionId: null });
        } else {
            conditions.push({ botId: bot.id, sessionId: null });
        }

        if (sessionId) {
            conditions.push({ sessionId });
        }

        return prisma.trigger.findMany({
            where: {
                isActive: true,
                scope: { in: scopes },
                OR: conditions,
            },
            include: { flow: true },
        });
    }

    /**
     * Returns the bot's variables dictionary for interpolation.
     */
    static getVariables(bot: Bot): Record<string, string> {
        return (bot.botVariables as Record<string, string>) ?? {};
    }

    /**
     * Interpolates {{VARIABLE}} placeholders in a string using bot variables.
     */
    static interpolate(text: string, variables: Record<string, string>): string {
        if (!text || Object.keys(variables).length === 0) return text;
        return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return variables[key] !== undefined ? variables[key] : match;
        });
    }
}

export type { BotWithTemplate, AIConfig };
