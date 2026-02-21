/**
 * Sanitize a tool name for AI function calling (snake_case, no special chars).
 */
export function sanitizeToolName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}
