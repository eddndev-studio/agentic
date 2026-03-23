/**
 * Shared utility functions to eliminate code duplication across the backend.
 */

import { safeParseMessageMetadata } from "../schemas";

/** Returns true if `source` is an HTTP or HTTPS URL. */
export function isRemoteUrl(source: string): boolean {
    return source.startsWith("http://") || source.startsWith("https://");
}

/**
 * Safely merge a patch into an existing message's JSON metadata column.
 * Reads the current metadata, spreads the patch on top, and writes it back.
 */
export async function updateMessageMetadata(messageId: string, patch: Record<string, any>): Promise<void> {
    const { prisma } = await import("../services/postgres.service");
    const existing = await prisma.message.findUnique({ where: { id: messageId }, select: { metadata: true } });
    await prisma.message.update({
        where: { id: messageId },
        data: { metadata: { ...safeParseMessageMetadata(existing?.metadata), ...patch } },
    });
}
