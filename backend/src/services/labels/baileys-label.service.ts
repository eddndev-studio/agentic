/**
 * Baileys-specific label operations.
 *
 * Handles WhatsApp socket calls (addChatLabel, removeChatLabel),
 * LID↔phone JID resolution, app state reconciliation, and incoming
 * label events from Baileys. Delegates persistence to LabelPersistenceService.
 */
import { type WASocket, jidNormalizedUser } from '@whiskeysockets/baileys';
import { prisma } from '../postgres.service';
import { eventBus } from '../event-bus';
import { upsertSessionFromChat } from '../session-helpers';
import { LabelPersistenceService } from './label-persistence.service';
import { config } from '../../config';
import { createLogger } from '../../logger';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger('BaileysLabel');

const AUTH_DIR = 'auth_info_baileys';

// Label reconciliation timers: botId -> intervalId
const labelReconcileTimers = new Map<string, ReturnType<typeof setInterval>>();

export class BaileysLabelService {
    /**
     * Force a full label sync by clearing the cached app state version
     * and re-downloading all label data from WhatsApp.
     */
    static async syncLabels(sock: WASocket, botId: string): Promise<void> {
        const versionFile = path.join(AUTH_DIR, botId, 'app-state-sync-version-regular_high.json');
        try { fs.unlinkSync(versionFile); } catch {}

        await (sock as any).authState.keys.set({
            'app-state-sync-version': { 'regular_high': null }
        });

        await (sock as any).resyncAppState(['regular_high'], true);
    }

    /**
     * Resolve a phone JID to the LID that WhatsApp uses internally for app state patches.
     */
    private static async resolveJidForAppState(sock: WASocket, phoneJid: string): Promise<string> {
        try {
            const lid = await (sock as any).signalRepository.lidMapping.getLIDForPN(phoneJid);
            if (lid) {
                log.info(`Resolved ${phoneJid} -> ${lid} for app state`);
                return lid;
            }
        } catch (e) { log.warn('JID-to-LID resolution failed:', (e as Error).message); }
        return phoneJid;
    }

    static async addChatLabel(sock: WASocket, botId: string, chatJid: string, waLabelId: string): Promise<void> {
        const jid = await this.resolveJidForAppState(sock, chatJid);
        log.info(`addChatLabel: jid=${jid}, waLabelId=${waLabelId}`);
        await (sock as any).addChatLabel(jid, waLabelId);
    }

    static async removeChatLabel(sock: WASocket, botId: string, chatJid: string, waLabelId: string): Promise<void> {
        const jid = await this.resolveJidForAppState(sock, chatJid);
        log.info(`removeChatLabel: jid=${jid}, waLabelId=${waLabelId}`);
        await (sock as any).removeChatLabel(jid, waLabelId);
    }

    // ── Label CRUD ───────────────────────────────────────────────────────────

    /**
     * Create a new WhatsApp label.
     * Generates a numeric ID (max existing + 1, min 6 to avoid predefined slots).
     */
    static async createLabel(sock: WASocket, botId: string, name: string, color: number): Promise<{ waLabelId: string }> {
        const existing = await prisma.label.findMany({
            where: { botId },
            select: { waLabelId: true },
        });
        const maxId = existing.reduce((max, l) => {
            const n = parseInt(l.waLabelId, 10);
            return isNaN(n) ? max : Math.max(max, n);
        }, 5); // min 5 so first custom label is 6
        const newId = String(maxId + 1);

        await (sock as any).addLabel('', { id: newId, name, color });

        // Optimistic DB upsert
        await LabelPersistenceService.handleLabelEdit(botId, {
            id: newId, name, color, deleted: false,
        });

        log.info(`Created label "${name}" (id=${newId}, color=${color}) for Bot ${botId}`);
        return { waLabelId: newId };
    }

    /**
     * Update a label's name and/or color.
     */
    static async updateLabel(sock: WASocket, botId: string, waLabelId: string, data: { name?: string; color?: number }): Promise<void> {
        const body: Record<string, unknown> = { id: waLabelId };
        if (data.name !== undefined) body.name = data.name;
        if (data.color !== undefined) body.color = data.color;

        await (sock as any).addLabel('', body);

        // Optimistic DB update
        const updateData: Record<string, unknown> = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.color !== undefined) updateData.color = data.color;
        if (Object.keys(updateData).length > 0) {
            await prisma.label.update({
                where: { botId_waLabelId: { botId, waLabelId } },
                data: updateData,
            });
        }

        log.info(`Updated label ${waLabelId} for Bot ${botId}:`, data);
    }

    /**
     * Soft-delete a label and clean up associations.
     */
    static async deleteLabel(sock: WASocket, botId: string, waLabelId: string): Promise<void> {
        await (sock as any).addLabel('', { id: waLabelId, deleted: true });

        // Optimistic: soft-delete + remove associations
        const label = await prisma.label.findUnique({
            where: { botId_waLabelId: { botId, waLabelId } },
        });
        if (label) {
            await prisma.sessionLabel.deleteMany({ where: { labelId: label.id } });
            await prisma.label.update({
                where: { id: label.id },
                data: { deleted: true },
            });
        }

        log.info(`Deleted label ${waLabelId} for Bot ${botId}`);
    }

    // ── Reconciliation ──────────────────────────────────────────────────────

    static async reconcileLabels(botId: string, getSocket: () => WASocket | undefined): Promise<void> {
        const sock = getSocket();
        if (!sock) return;

        log.info(`Label reconciliation starting for Bot ${botId}`);

        const beforeLabels = await prisma.sessionLabel.findMany({
            where: { session: { botId } },
            select: { sessionId: true, labelId: true },
        });
        const beforeSet = new Set(beforeLabels.map(sl => `${sl.sessionId}:${sl.labelId}`));

        try {
            await this.syncLabels(sock, botId);
        } catch (e: unknown) {
            log.warn(`Label reconciliation sync failed for Bot ${botId}:`, (e as Error).message);
            return;
        }

        await new Promise(r => setTimeout(r, 3000));

        const afterLabels = await prisma.sessionLabel.findMany({
            where: { session: { botId } },
            select: { sessionId: true, labelId: true },
        });
        const afterSet = new Set(afterLabels.map(sl => `${sl.sessionId}:${sl.labelId}`));

        let reconciledAdds = 0;
        for (const key of afterSet) {
            if (!beforeSet.has(key)) reconciledAdds++;
        }

        if (reconciledAdds > 0) {
            log.info(`Label reconciliation found ${reconciledAdds} missed add(s) for Bot ${botId}`);
        } else {
            log.info(`Label reconciliation complete for Bot ${botId} — no drift detected`);
        }
    }

    static startLabelReconciliation(botId: string, getSocket: () => WASocket | undefined): void {
        this.stopLabelReconciliation(botId);

        const timer = setInterval(() => {
            this.reconcileLabels(botId, getSocket).catch(err => {
                log.error(`Label reconciliation error for Bot ${botId}:`, err.message);
            });
        }, config.labels.reconcileInterval);

        labelReconcileTimers.set(botId, timer);
        log.info(`Label reconciliation started for Bot ${botId} (every ${config.labels.reconcileInterval / 1000}s)`);
    }

    static stopLabelReconciliation(botId: string): void {
        const existing = labelReconcileTimers.get(botId);
        if (existing) {
            clearInterval(existing);
            labelReconcileTimers.delete(botId);
        }
    }

    static stopAllReconciliation(): void {
        for (const [botId] of labelReconcileTimers) {
            this.stopLabelReconciliation(botId);
        }
    }

    // ── Baileys event handlers ──────────────────────────────────────────────

    /**
     * Handle the `labels.association` event from Baileys.
     * Resolves LID → phone JID, upserts session, then delegates to LabelPersistenceService.
     */
    static async handleBaileysLabelAssociation(
        botId: string,
        event: { type: string; association: { type: string; chatId: string; labelId: string | number } },
        sock: WASocket,
    ): Promise<void> {
        try {
            const association = event.association;
            log.info('labels.association event:', JSON.stringify(event));

            if (event.type !== 'add' && event.type !== 'remove') return;
            if (association.type !== 'label_jid') return;

            const rawChatId = association.chatId;
            const waLabelId = String(association.labelId);

            // Resolve chatId: if LID, convert to phone JID
            let resolvedJid = jidNormalizedUser(rawChatId);
            if (resolvedJid.endsWith('@lid')) {
                try {
                    const pn = await (sock as any).signalRepository.lidMapping.getPNForLID(resolvedJid);
                    if (pn) {
                        resolvedJid = jidNormalizedUser(pn);
                        log.info(`LID ${rawChatId} resolved to ${resolvedJid}`);
                    }
                } catch (e: unknown) {
                    log.warn(`LID resolution failed for ${rawChatId}:`, (e as Error).message);
                }
            }

            // Find-or-create session
            const altId = resolvedJid !== rawChatId ? rawChatId : undefined;
            const { session, created: sessionCreated } = await upsertSessionFromChat(
                botId, resolvedJid, undefined, altId
            );
            if (!session) {
                log.warn(`labels.association: Could not resolve session for ${rawChatId}`);
                return;
            }
            if (sessionCreated) {
                eventBus.emitBotEvent({ type: 'session:created', botId, session });
            }

            // Look up label by waLabelId
            const label = await prisma.label.findUnique({
                where: { botId_waLabelId: { botId, waLabelId } },
            });
            if (!label) {
                log.warn(`labels.association: No label for waLabelId=${waLabelId}, skipping`);
                return;
            }

            // Dedup: skip if already processed recently
            if (LabelPersistenceService.isDuplicate(botId, session.id, label.id, event.type as 'add' | 'remove')) {
                log.info(`labels.association: Skipping duplicate for ${label.name} (${event.type})`);
                return;
            }

            // Delegate persistence + events + flow triggers
            await LabelPersistenceService.persistLabelAssociation(
                botId, session.id, label.id, event.type as 'add' | 'remove',
            );
        } catch (e) {
            log.error('labels.association error:', e);
        }
    }
}
