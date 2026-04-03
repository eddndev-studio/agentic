import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('../postgres.service', () => ({
    prisma: {
        label: { findUnique: vi.fn(), upsert: vi.fn() },
        sessionLabel: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    },
}));

vi.mock('../event-bus', () => ({
    eventBus: { emitBotEvent: vi.fn() },
}));

vi.mock('../../core/flow', () => ({
    flowEngine: { processLabelEvent: vi.fn().mockResolvedValue(undefined) },
}));

import { LabelPersistenceService } from './label-persistence.service';
import { prisma } from '../postgres.service';
import { eventBus } from '../event-bus';
import { flowEngine } from '../../core/flow';

const mockPrisma = prisma as any;
const mockEventBus = eventBus as any;
const mockFlowEngine = flowEngine as any;

describe('LabelPersistenceService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── handleLabelEdit ─────────────────────────────────────────────────────

    describe('handleLabelEdit', () => {
        it('upserts label metadata into DB', async () => {
            await LabelPersistenceService.handleLabelEdit('bot-1', {
                id: '5', name: 'VIP', color: 3, deleted: false,
            });

            expect(mockPrisma.label.upsert).toHaveBeenCalledWith({
                where: { botId_waLabelId: { botId: 'bot-1', waLabelId: '5' } },
                update: { name: 'VIP', color: 3, deleted: false, predefinedId: null },
                create: { botId: 'bot-1', waLabelId: '5', name: 'VIP', color: 3, deleted: false, predefinedId: null },
            });
        });

        it('handles numeric label ID by converting to string', async () => {
            await LabelPersistenceService.handleLabelEdit('bot-1', {
                id: 42, name: 'Spam',
            });

            expect(mockPrisma.label.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { botId_waLabelId: { botId: 'bot-1', waLabelId: '42' } },
                }),
            );
        });
    });

    // ── persistLabelAssociation ─────────────────────────────────────────────

    describe('persistLabelAssociation', () => {
        const LABEL = { id: 'label-1', name: 'VIP', color: 2, waLabelId: '5', botId: 'bot-1' };

        beforeEach(() => {
            mockPrisma.label.findUnique.mockResolvedValue(LABEL);
            mockPrisma.sessionLabel.findMany.mockResolvedValue([
                { label: LABEL },
            ]);
        });

        it('adds a label: upserts SessionLabel + emits events + triggers flow', async () => {
            await LabelPersistenceService.persistLabelAssociation('bot-1', 'session-1', 'label-1', 'add');

            // DB upsert
            expect(mockPrisma.sessionLabel.upsert).toHaveBeenCalledWith({
                where: { sessionId_labelId: { sessionId: 'session-1', labelId: 'label-1' } },
                update: {},
                create: { sessionId: 'session-1', labelId: 'label-1' },
            });

            // SSE events (specific + generic)
            expect(mockEventBus.emitBotEvent).toHaveBeenCalledTimes(2);
            expect(mockEventBus.emitBotEvent).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'session:labels:add', botId: 'bot-1', sessionId: 'session-1' }),
            );
            expect(mockEventBus.emitBotEvent).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'session:labels', action: 'add' }),
            );

            // Flow trigger
            expect(mockFlowEngine.processLabelEvent).toHaveBeenCalledWith(
                'session-1', 'bot-1', 'VIP', 'add', undefined,
            );
        });

        it('removes a label: deletes SessionLabel + emits events', async () => {
            await LabelPersistenceService.persistLabelAssociation('bot-1', 'session-1', 'label-1', 'remove');

            expect(mockPrisma.sessionLabel.deleteMany).toHaveBeenCalledWith({
                where: { sessionId: 'session-1', labelId: 'label-1' },
            });

            expect(mockEventBus.emitBotEvent).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'session:labels:remove' }),
            );
        });

        it('passes sourceFlowId to processLabelEvent', async () => {
            await LabelPersistenceService.persistLabelAssociation('bot-1', 'session-1', 'label-1', 'add', 'flow-42');

            expect(mockFlowEngine.processLabelEvent).toHaveBeenCalledWith(
                'session-1', 'bot-1', 'VIP', 'add', 'flow-42',
            );
        });

        it('skips silently when label not found', async () => {
            mockPrisma.label.findUnique.mockResolvedValue(null);

            await LabelPersistenceService.persistLabelAssociation('bot-1', 'session-1', 'nonexistent', 'add');

            expect(mockPrisma.sessionLabel.upsert).not.toHaveBeenCalled();
            expect(mockEventBus.emitBotEvent).not.toHaveBeenCalled();
        });
    });

    // ── Dedup ───────────────────────────────────────────────────────────────

    describe('dedup', () => {
        it('markLabelEventHandled() prevents isDuplicate from returning false', () => {
            LabelPersistenceService.markLabelEventHandled('bot-1', 'sess-1', 'label-1', 'add');
            const dup = LabelPersistenceService.isDuplicate('bot-1', 'sess-1', 'label-1', 'add');
            expect(dup).toBe(true);
        });

        it('isDuplicate() returns false for fresh events', () => {
            const dup = LabelPersistenceService.isDuplicate('bot-1', 'sess-fresh', 'label-fresh', 'remove');
            expect(dup).toBe(false);
        });

        it('isDuplicate() returns false for different action on same label', () => {
            LabelPersistenceService.markLabelEventHandled('bot-1', 'sess-1', 'label-1', 'add');
            const dup = LabelPersistenceService.isDuplicate('bot-1', 'sess-1', 'label-1', 'remove');
            expect(dup).toBe(false);
        });
    });
});
