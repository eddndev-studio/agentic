/**
 * Provider-agnostic label persistence layer.
 *
 * Handles DB operations, dedup cache, SSE event emission, and flow triggers
 * for label changes — regardless of which messaging provider originated them.
 */
import { prisma } from '../postgres.service';
import { eventBus } from '../event-bus';
import { flowEngine } from '../../core/flow';
import { config } from '../../config';
import { createLogger } from '../../logger';

const log = createLogger('LabelPersistence');

// ── Dedup guard ─────────────────────────────────────────────────────────────
// Prevents double-firing when local code emits AND provider re-emits the same event.
// Key: "botId:sessionId:labelId:action", value: timestamp
const recentLabelEvents = new Map<string, number>();

// Periodic cleanup: evict expired entries every 60 seconds
const labelDedupCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, ts] of recentLabelEvents) {
        if (now - ts > config.labels.dedupTtl) recentLabelEvents.delete(k);
    }
}, 60_000);
labelDedupCleanupTimer.unref();

// ── Helpers ─────────────────────────────────────────────────────────────────

function evictExpiredDedup(): void {
    if (recentLabelEvents.size > config.labels.dedupMax) {
        const now = Date.now();
        for (const [k, ts] of recentLabelEvents) {
            if (now - ts > config.labels.dedupTtl) recentLabelEvents.delete(k);
        }
    }
}

async function queryLabelPayload(sessionId: string) {
    const rows = await prisma.sessionLabel.findMany({
        where: { sessionId },
        include: { label: true },
    });
    return rows.map(sl => ({
        id: sl.label.id,
        name: sl.label.name,
        color: sl.label.color,
        waLabelId: sl.label.waLabelId,
    }));
}

function emitLabelEvents(
    botId: string,
    sessionId: string,
    labels: ReturnType<typeof queryLabelPayload> extends Promise<infer T> ? T : never,
    changedLabelId: string,
    changedLabelName: string,
    action: 'add' | 'remove',
): void {
    eventBus.emitBotEvent({
        type: action === 'add' ? 'session:labels:add' : 'session:labels:remove',
        botId,
        sessionId,
        labels,
        changedLabelId,
        changedLabelName,
    });
    eventBus.emitBotEvent({
        type: 'session:labels',
        botId,
        sessionId,
        labels,
        changedLabelId,
        changedLabelName,
        action,
    });
}

// ── Public API ──────────────────────────────────────────────────────────────

export class LabelPersistenceService {
    /**
     * Mark a label event as already handled so the provider's event handler
     * skips it if it arrives within the dedup window.
     */
    static markLabelEventHandled(botId: string, sessionId: string, labelId: string, action: 'add' | 'remove'): void {
        const key = `${botId}:${sessionId}:${labelId}:${action}`;
        recentLabelEvents.set(key, Date.now());
        evictExpiredDedup();
    }

    /**
     * Check whether this event was already processed recently.
     * If not, marks it as processed and returns false (= not a duplicate).
     * If yes, returns true (= skip).
     */
    static isDuplicate(botId: string, sessionId: string, labelId: string, action: 'add' | 'remove'): boolean {
        const key = `${botId}:${sessionId}:${labelId}:${action}`;
        const ts = recentLabelEvents.get(key);
        if (ts && Date.now() - ts < config.labels.dedupTtl) return true;
        recentLabelEvents.set(key, Date.now());
        evictExpiredDedup();
        return false;
    }

    /**
     * Handle a `labels.edit` event: upsert label metadata into DB.
     * Provider-agnostic — only touches the Label table.
     */
    static async handleLabelEdit(
        botId: string,
        label: { id: string | number; name: string; color?: number; deleted?: boolean; predefinedId?: string | null },
    ): Promise<void> {
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
     * Central function to persist a label association change, emit SSE events,
     * and trigger flows. Called from:
     *   - BaileysLabelService (incoming Baileys events)
     *   - SessionController (API endpoints)
     *   - ToolExecutor (AI tool calls)
     */
    static async persistLabelAssociation(
        botId: string,
        sessionId: string,
        labelId: string,
        action: 'add' | 'remove',
        sourceFlowId?: string,
    ): Promise<void> {
        const label = await prisma.label.findUnique({ where: { id: labelId } });
        if (!label) {
            log.warn(`persistLabelAssociation: label ${labelId} not found, skipping`);
            return;
        }

        if (action === 'add') {
            try {
                await prisma.sessionLabel.upsert({
                    where: { sessionId_labelId: { sessionId, labelId } },
                    update: {},
                    create: { sessionId, labelId },
                });
            } catch (e: unknown) {
                if (!(e instanceof Error && 'code' in e && (e as Record<string, unknown>).code === 'P2002')) throw e;
            }
            log.info(`Label "${label.name}" added to session ${sessionId}`);
        } else {
            await prisma.sessionLabel.deleteMany({
                where: { sessionId, labelId },
            });
            log.info(`Label "${label.name}" removed from session ${sessionId}`);
        }

        const labels = await queryLabelPayload(sessionId);
        emitLabelEvents(botId, sessionId, labels, label.id, label.name, action);

        flowEngine.processLabelEvent(sessionId, botId, label.name, action, sourceFlowId).catch(err => {
            log.error('FlowEngine label trigger error:', err);
        });
    }
}
