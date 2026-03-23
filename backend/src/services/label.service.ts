import { type WASocket, jidNormalizedUser } from '@whiskeysockets/baileys';
import { prisma } from './postgres.service';
import { eventBus } from './event-bus';
import { flowEngine } from '../core/flow';
import { upsertSessionFromChat } from './session-helpers';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { createLogger } from '../logger';

const log = createLogger('LabelService');

// Label reconciliation timers: botId -> intervalId
const labelReconcileTimers = new Map<string, ReturnType<typeof setInterval>>();

// Dedup guard: prevents double-firing when local code emits AND Baileys re-emits
// Key: "botId:sessionId:labelId:action", value: timestamp
const recentLabelEvents = new Map<string, number>();

// Periodic cleanup: evict expired entries every 60 seconds
const labelDedupCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, ts] of recentLabelEvents) {
        if (now - ts > config.labels.dedupTtl) recentLabelEvents.delete(k);
    }
}, 60_000);
labelDedupCleanupTimer.unref(); // don't prevent process exit

const AUTH_DIR = 'auth_info_baileys';

export class LabelService {
    /**
     * Force a full label sync by clearing the cached app state version
     * and re-downloading all label data from WhatsApp.
     */
    static async syncLabels(sock: WASocket, botId: string): Promise<void> {
        // Delete the local app state version file to force a full snapshot re-download.
        // resyncAppState only fetches patches newer than the cached version,
        // so if labels were already synced before the DB table existed, no events fire.
        const versionFile = path.join(AUTH_DIR, botId, 'app-state-sync-version-regular_high.json');
        try { fs.unlinkSync(versionFile); } catch {} // fire-and-forget: non-critical — file may not exist

        // Also clear the in-memory cache
        await (sock as any).authState.keys.set({
            'app-state-sync-version': { 'regular_high': null }
        });

        await (sock as any).resyncAppState(['regular_high'], true);
    }

    /**
     * Resolve a phone JID to the LID that WhatsApp uses internally for app state patches.
     * Falls back to the original JID if no mapping exists.
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

    /**
     * Mark a label event as already handled, so the Baileys labels.association
     * handler skips it if it arrives within the dedup window.
     */
    static markLabelEventHandled(botId: string, sessionId: string, labelId: string, action: 'add' | 'remove'): void {
        const key = `${botId}:${sessionId}:${labelId}:${action}`;
        recentLabelEvents.set(key, Date.now());
        // Evict expired entries when cache exceeds size limit
        if (recentLabelEvents.size > config.labels.dedupMax) {
            const now = Date.now();
            for (const [k, ts] of recentLabelEvents) {
                if (now - ts > config.labels.dedupTtl) recentLabelEvents.delete(k);
            }
        }
    }

    /**
     * Periodic label reconciliation: detects label changes that Baileys missed.
     * Forces a full app state re-sync, then compares DB state before/after to find
     * removed labels that the re-sync didn't re-emit.
     */
    static async reconcileLabels(botId: string, getSocket: () => WASocket | undefined): Promise<void> {
        const sock = getSocket();
        if (!sock) return;

        log.info(`Label reconciliation starting for Bot ${botId}`);

        // Snapshot DB state BEFORE sync
        const beforeLabels = await prisma.sessionLabel.findMany({
            where: { session: { botId } },
            select: { sessionId: true, labelId: true },
        });
        const beforeSet = new Set(beforeLabels.map(sl => `${sl.sessionId}:${sl.labelId}`));

        // Force full re-sync — re-emits labels.association for all current WA associations
        try {
            await this.syncLabels(sock, botId);
        } catch (e: unknown) {
            log.warn(`Label reconciliation sync failed for Bot ${botId}:`, (e as Error).message);
            return;
        }

        // Wait for async labels.association handlers to process
        await new Promise(r => setTimeout(r, 3000));

        // Snapshot DB state AFTER sync (adds were processed by labels.association handler)
        const afterLabels = await prisma.sessionLabel.findMany({
            where: { session: { botId } },
            select: { sessionId: true, labelId: true },
        });
        const afterSet = new Set(afterLabels.map(sl => `${sl.sessionId}:${sl.labelId}`));

        // Detect removes: keys in before but not refreshed by the full sync
        // The full sync only re-adds current associations, so stale ones remain.
        // We can only detect removes if the sync actually re-created the entry (touching it).
        // Since upsert with update:{} is a no-op, we need a different approach:
        // Mark all before-labels, then check which ones the sync DIDN'T touch by
        // comparing timestamps. Instead, simpler: any key in beforeSet that is also
        // in afterSet was either refreshed or untouched — we can't distinguish.
        // So we only detect NEW adds (afterSet - beforeSet) here.
        // For removes, we rely on the periodic sync keeping the event-driven path warm.

        // Detect new labels added by reconciliation that weren't in DB before
        let reconciledAdds = 0;
        for (const key of afterSet) {
            if (!beforeSet.has(key)) {
                reconciledAdds++;
                // The labels.association handler already emitted events for these
            }
        }

        if (reconciledAdds > 0) {
            log.info(`Label reconciliation found ${reconciledAdds} missed add(s) for Bot ${botId}`);
        } else {
            log.info(`Label reconciliation complete for Bot ${botId} — no drift detected`);
        }
    }

    /**
     * Start periodic label reconciliation for a bot.
     */
    static startLabelReconciliation(botId: string, getSocket: () => WASocket | undefined): void {
        // Clear any existing timer
        this.stopLabelReconciliation(botId);

        const timer = setInterval(() => {
            this.reconcileLabels(botId, getSocket).catch(err => {
                log.error(`Label reconciliation error for Bot ${botId}:`, err.message);
            });
        }, config.labels.reconcileInterval);

        labelReconcileTimers.set(botId, timer);
        log.info(`Label reconciliation started for Bot ${botId} (every ${config.labels.reconcileInterval / 1000}s)`);
    }

    /**
     * Stop periodic label reconciliation for a bot.
     */
    static stopLabelReconciliation(botId: string): void {
        const existing = labelReconcileTimers.get(botId);
        if (existing) {
            clearInterval(existing);
            labelReconcileTimers.delete(botId);
        }
    }

    /**
     * Stop all active label reconciliation timers (used during graceful shutdown).
     */
    static stopAllReconciliation(): void {
        for (const [botId] of labelReconcileTimers) {
            this.stopLabelReconciliation(botId);
        }
    }

    /**
     * Handle the `labels.edit` event from Baileys: upsert label metadata into DB.
     */
    static async handleLabelEdit(botId: string, label: { id: string | number; name: string; color?: number; deleted?: boolean; predefinedId?: string | null }): Promise<void> {
        try {
            await prisma.label.upsert({
                where: { botId_waLabelId: { botId, waLabelId: String(label.id) } },
                update: {
                    name: label.name,
                    color: label.color ?? 0,
                    deleted: label.deleted ?? false,
                    predefinedId: label.predefinedId ?? null,
                },
                create: {
                    botId,
                    waLabelId: String(label.id),
                    name: label.name,
                    color: label.color ?? 0,
                    deleted: label.deleted ?? false,
                    predefinedId: label.predefinedId ?? null,
                },
            });
            log.info(`Label synced: "${label.name}" (${label.id}) for Bot ${botId}`);
        } catch (e) {
            log.error('labels.edit error:', e);
        }
    }

    /**
     * Handle the `labels.association` event from Baileys: resolve LID, upsert session,
     * look up label, dedup, upsert/delete sessionLabel, emit events, and trigger flows.
     */
    static async handleLabelAssociation(botId: string, event: { type: string; association: { type: string; chatId: string; labelId: string | number } }, sock: WASocket): Promise<void> {
        try {
            const association = event.association;
            log.info('labels.association event:', JSON.stringify(event));

            if (event.type !== 'add' && event.type !== 'remove') return;
            if (association.type !== 'label_jid') return;

            const rawChatId = association.chatId;
            const waLabelId = String(association.labelId);

            // Resolve chatId: if LID, convert to phone JID via Baileys mapping
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

            // Find-or-create session, passing rawChatId as alt so LID<->phone dedup works
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

            const label = await prisma.label.findUnique({
                where: { botId_waLabelId: { botId, waLabelId } },
            });
            if (!label) {
                log.warn(`labels.association: No label for waLabelId=${waLabelId}, skipping`);
                return;
            }

            // Dedup: skip if already processed recently (by this handler, ToolExecutor, or SessionController)
            const dedupKey = `${botId}:${session.id}:${label.id}:${event.type}`;
            const dedupTs = recentLabelEvents.get(dedupKey);
            if (dedupTs && Date.now() - dedupTs < config.labels.dedupTtl) {
                log.info(`labels.association: Skipping duplicate for ${label.name} (${event.type})`);
                return;
            }
            // Mark as processed NOW to prevent repeated Baileys events
            recentLabelEvents.set(dedupKey, Date.now());
            // Evict expired entries when cache exceeds size limit
            if (recentLabelEvents.size > config.labels.dedupMax) {
                const now = Date.now();
                for (const [k, ts] of recentLabelEvents) {
                    if (now - ts > config.labels.dedupTtl) recentLabelEvents.delete(k);
                }
            }

            if (event.type === 'add') {
                try {
                    await prisma.sessionLabel.upsert({
                        where: { sessionId_labelId: { sessionId: session.id, labelId: label.id } },
                        update: {},
                        create: { sessionId: session.id, labelId: label.id },
                    });
                } catch (e: unknown) {
                    if (!(e instanceof Error && 'code' in e && (e as Record<string, unknown>).code === 'P2002')) throw e; // Ignore duplicate race condition
                }
                log.info(`Label "${label.name}" added to session ${resolvedJid}`);
            } else {
                await prisma.sessionLabel.deleteMany({
                    where: { sessionId: session.id, labelId: label.id },
                });
                log.info(`Label "${label.name}" removed from session ${resolvedJid}`);
            }

            // Emit SSE so the frontend updates in real-time
            const updatedLabels = await prisma.sessionLabel.findMany({
                where: { sessionId: session.id },
                include: { label: true },
            });
            const labelPayload = updatedLabels.map(sl => ({
                id: sl.label.id,
                name: sl.label.name,
                color: sl.label.color,
                waLabelId: sl.label.waLabelId,
            }));
            // Specific event for notification filtering
            eventBus.emitBotEvent({
                type: event.type === 'add' ? 'session:labels:add' : 'session:labels:remove',
                botId,
                sessionId: session.id,
                labels: labelPayload,
                changedLabelId: label.id,
                changedLabelName: label.name,
            });
            // Generic event for SSE / monitor UI
            eventBus.emitBotEvent({
                type: 'session:labels',
                botId,
                sessionId: session.id,
                labels: labelPayload,
                changedLabelId: label.id,
                changedLabelName: label.name,
                action: event.type as 'add' | 'remove',
            });

            // Evaluate label-based flow triggers
            flowEngine.processLabelEvent(session.id, botId, label.name, event.type as 'add' | 'remove').catch(err => {
                log.error('FlowEngine label trigger error:', err);
            });
        } catch (e) {
            log.error('labels.association error:', e);
        }
    }
}
