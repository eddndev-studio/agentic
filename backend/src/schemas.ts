/**
 * Zod validation schemas for all Prisma JSON fields.
 *
 * Each schema mirrors the actual runtime shape observed across the codebase.
 * Schemas use `.passthrough()` where forward-compatible extra fields are expected,
 * ensuring new properties don't break parsing.
 *
 * Safe-parse helpers return sensible defaults on invalid input so callers never
 * need to null-check the result — they get a typed object every time.
 */
import { z } from "zod";

// ─── Message.metadata ────────────────────────────────────────────────────────

export const MessageMetadataSchema = z
    .object({
        mediaUrl: z.string().optional(),
        mediaDescription: z.string().optional(),
        animated: z.boolean().optional(), // stickers
        reactedTo: z
            .object({ id: z.string(), fromMe: z.boolean() })
            .optional(),
        vcard: z.string().optional(),
        contacts: z
            .array(z.object({ name: z.string(), vcard: z.string() }))
            .optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        live: z.boolean().optional(),
        options: z.array(z.string()).optional(), // polls
    })
    .passthrough();

export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

// ─── Step.metadata ───────────────────────────────────────────────────────────

const ConditionalBranchSchema = z.object({
    startTime: z.string(),
    endTime: z.string(),
    type: z.string().optional(),
    content: z.string().optional(),
    mediaUrl: z.string().optional(),
});

const FallbackSchema = z.object({
    type: z.string().optional(),
    content: z.string().optional(),
    mediaUrl: z.string().optional(),
});

export const StepMetadataSchema = z
    .object({
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        toolName: z.string().optional(),
        toolArgs: z.record(z.string(), z.any()).optional(),
        linkPreview: z.boolean().optional(),
        branches: z.array(ConditionalBranchSchema).optional(),
        fallback: FallbackSchema.optional(),
    })
    .passthrough();

export type StepMetadata = z.infer<typeof StepMetadataSchema>;

// ─── Tool.actionConfig ───────────────────────────────────────────────────────

export const ToolActionConfigSchema = z
    .object({
        flowId: z.string().optional(),
        builtinName: z.string().optional(),
        url: z.string().optional(), // webhook URL
        method: z.string().optional(), // webhook method
        headers: z.record(z.string(), z.string()).optional(), // webhook headers
    })
    .passthrough();

export type ToolActionConfig = z.infer<typeof ToolActionConfigSchema>;

// ─── Bot.notificationChannels ────────────────────────────────────────────────

export const NotificationChannelSchema = z.object({
    sessionId: z.string(),
    events: z.array(z.string()),
    labels: z.array(z.string()),
    nickname: z.string().optional(),
});

export const NotificationChannelsSchema = z.array(NotificationChannelSchema);

export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

// ─── Bot.credentials ─────────────────────────────────────────────────────────

export const BotCredentialsSchema = z
    .object({
        webhookSecret: z.string().optional(),
    })
    .passthrough();

export type BotCredentials = z.infer<typeof BotCredentialsSchema>;

// ─── Bot.botVariables ────────────────────────────────────────────────────────

export const MediaVariableValueSchema = z.object({
    type: z.literal('media'),
    value: z.string(),
    mediaType: z.enum(['image', 'video', 'audio', 'document']),
});

export const BotVariableValueSchema = z.union([
    z.string(),
    MediaVariableValueSchema,
]);

export const BotVariablesSchema = z.record(z.string(), BotVariableValueSchema);

export type BotVariableValue = z.infer<typeof BotVariableValueSchema>;
export type BotVariables = z.infer<typeof BotVariablesSchema>;

// ─── Template.variables ──────────────────────────────────────────────────────

export const TemplateVariableSchema = z.object({
    key: z.string(),
    value: z.string(),
    type: z.enum(['text', 'label', 'image', 'video', 'audio', 'document']).optional().default('text'),
});

export const TemplateVariablesSchema = z.array(TemplateVariableSchema);

export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;

// ─── Execution.variableContext ───────────────────────────────────────────────

export const VariableContextSchema = z.record(z.string(), z.any());

export type VariableContext = z.infer<typeof VariableContextSchema>;

// ─── ConversationLog.toolArgs / toolResult ───────────────────────────────────

export const ToolArgsSchema = z.record(z.string(), z.any());
export const ToolResultSchema = z.any();

// ─── Tool.parameters (OpenAPI-style JSON Schema) ─────────────────────────────

export const ToolParametersSchema = z
    .object({
        type: z.string().optional(),
        properties: z.record(z.string(), z.any()).optional(),
        required: z.array(z.string()).optional(),
    })
    .passthrough();

export type ToolParameters = z.infer<typeof ToolParametersSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Safe-parse helpers — return defaults on invalid/null input
// ═══════════════════════════════════════════════════════════════════════════════

export function safeParseMessageMetadata(raw: unknown): MessageMetadata {
    const result = MessageMetadataSchema.safeParse(raw ?? {});
    return result.success ? result.data : {};
}

export function safeParseStepMetadata(raw: unknown): StepMetadata {
    const result = StepMetadataSchema.safeParse(raw ?? {});
    return result.success ? result.data : {};
}

export function safeParseToolActionConfig(raw: unknown): ToolActionConfig {
    const result = ToolActionConfigSchema.safeParse(raw ?? {});
    return result.success ? result.data : {};
}

export function safeParseNotificationChannels(raw: unknown): NotificationChannel[] {
    const result = NotificationChannelsSchema.safeParse(raw ?? []);
    return result.success ? result.data : [];
}

export function safeParseBotCredentials(raw: unknown): BotCredentials {
    const result = BotCredentialsSchema.safeParse(raw ?? {});
    return result.success ? result.data : {};
}
