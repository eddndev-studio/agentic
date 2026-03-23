import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { prisma } from './postgres.service';
import { Platform, SessionStatus, type Session } from '@prisma/client';
import { eventBus } from './event-bus';

/**
 * Update a session's name from a contact object (used by contacts.update, contacts.upsert, messaging-history.set).
 * Returns true if the name was changed.
 */
export async function updateContactName(botId: string, contact: { id?: string; notify?: string; verifiedName?: string; name?: string }): Promise<boolean> {
    if (!contact.id) return false;
    const name = contact.notify || contact.verifiedName || contact.name;
    if (!name) return false;
    const jid = jidNormalizedUser(contact.id);
    const session = await prisma.session.findUnique({
        where: { botId_identifier: { botId, identifier: jid } },
    });
    if (session && session.name !== name) {
        await prisma.session.update({ where: { id: session.id }, data: { name } });
        eventBus.emitBotEvent({ type: 'session:updated', botId, sessionId: session.id, name });
        return true;
    }
    return false;
}

/**
 * Find-or-create a session from a chat JID (used by chats.upsert, messaging-history.set, labels, messages).
 * Handles LID↔phone normalization and P2002 race conditions.
 * @param altIdentifier Optional fallback identifier to search (e.g. raw LID when primary is resolved phone)
 */
export async function upsertSessionFromChat(botId: string, jid: string, name?: string, altIdentifier?: string): Promise<{ session: Session | null; created: boolean }> {
    const identifier = jidNormalizedUser(jid);
    let session = await prisma.session.findUnique({
        where: { botId_identifier: { botId, identifier } },
    });
    if (session) return { session, created: false };

    // Fallback: check if session exists under an alternate identifier (e.g. LID vs phone)
    if (altIdentifier && altIdentifier !== identifier) {
        session = await prisma.session.findUnique({
            where: { botId_identifier: { botId, identifier: altIdentifier } },
        });
        if (session) {
            // Migrate session to the canonical identifier (phone > LID)
            if (!identifier.endsWith('@lid')) {
                try {
                    session = await prisma.session.update({
                        where: { id: session.id },
                        data: { identifier },
                    });
                    console.log(`[Baileys] Migrated session identifier from ${altIdentifier} to ${identifier}`);
                } catch (e: unknown) {
                    if (e instanceof Error && 'code' in e && (e as Record<string, unknown>).code === 'P2002') {
                        // Another session already has this identifier — merge by deleting the old one
                        const canonical = await prisma.session.findUnique({
                            where: { botId_identifier: { botId, identifier } },
                        });
                        if (canonical) {
                            session = canonical;
                        }
                    }
                }
            }
            return { session, created: false };
        }
    }

    try {
        session = await prisma.session.create({
            data: {
                botId,
                platform: Platform.WHATSAPP,
                identifier,
                name: name || identifier.split('@')[0],
                status: SessionStatus.CONNECTED,
            },
        });
        return { session, created: true };
    } catch (e: unknown) {
        if (e instanceof Error && 'code' in e && (e as Record<string, unknown>).code === 'P2002') {
            session = await prisma.session.findUnique({
                where: { botId_identifier: { botId, identifier } },
            });
            return { session, created: false };
        }
        throw e;
    }
}
