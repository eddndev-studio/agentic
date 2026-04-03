import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing registry
vi.mock('../services/postgres.service', () => ({
    prisma: {
        bot: { findUnique: vi.fn() },
    },
}));

// Mock the provider imports so registry module loads without side effects
vi.mock('./baileys.adapter', () => ({
    baileysProvider: {
        startSession: vi.fn(), stopSession: vi.fn(), shutdownAll: vi.fn(),
        getStatus: vi.fn(), getQR: vi.fn(), requestPairingCode: vi.fn(),
        sendMessage: vi.fn(), markRead: vi.fn(), sendPresence: vi.fn(),
        syncLabels: vi.fn(), addChatLabel: vi.fn(), removeChatLabel: vi.fn(),
        markLabelEventHandled: vi.fn(),
    },
}));

vi.mock('./waba.adapter', () => ({
    wabaProvider: {
        startSession: vi.fn(), stopSession: vi.fn(), shutdownAll: vi.fn(),
        getStatus: vi.fn(), getQR: vi.fn(), requestPairingCode: vi.fn(),
        sendMessage: vi.fn(), markRead: vi.fn(), sendPresence: vi.fn(),
        syncLabels: vi.fn(), addChatLabel: vi.fn(), removeChatLabel: vi.fn(),
        markLabelEventHandled: vi.fn(),
    },
}));

import { providerRegistry } from './registry';
import { prisma } from '../services/postgres.service';
import type { IMessagingProvider } from './types';

const mockPrisma = prisma as any;

function createMockProvider(overrides?: Partial<IMessagingProvider>): IMessagingProvider {
    return {
        startSession: vi.fn(), stopSession: vi.fn(), shutdownAll: vi.fn(),
        getStatus: vi.fn().mockReturnValue({ connected: false, hasQr: false }),
        getQR: vi.fn().mockReturnValue(null),
        requestPairingCode: vi.fn(),
        sendMessage: vi.fn(), markRead: vi.fn(), sendPresence: vi.fn(),
        syncLabels: vi.fn(), addChatLabel: vi.fn(), removeChatLabel: vi.fn(),
        markLabelEventHandled: vi.fn(),
        ...overrides,
    };
}

describe('ProviderRegistry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('get() returns registered provider for WHATSAPP', () => {
        const provider = providerRegistry.get('WHATSAPP' as any);
        expect(provider).toBeDefined();
    });

    it('get() returns registered provider for WHATSAPP_CLOUD', () => {
        const provider = providerRegistry.get('WHATSAPP_CLOUD' as any);
        expect(provider).toBeDefined();
    });

    it('get() throws for unregistered platform', () => {
        expect(() => providerRegistry.get('TELEGRAM' as any)).toThrow(
            'No messaging provider registered for platform: TELEGRAM',
        );
    });

    it('register() allows overriding a provider', () => {
        const custom = createMockProvider();
        providerRegistry.register('WHATSAPP_CLOUD' as any, custom);
        expect(providerRegistry.get('WHATSAPP_CLOUD' as any)).toBe(custom);
    });

    it('forBot() resolves platform from DB and returns provider', async () => {
        mockPrisma.bot.findUnique.mockResolvedValue({ platform: 'WHATSAPP' });
        const provider = await providerRegistry.forBot('bot-123');
        expect(provider).toBeDefined();
        expect(mockPrisma.bot.findUnique).toHaveBeenCalledWith({
            where: { id: 'bot-123' },
            select: { platform: true },
        });
    });

    it('forBot() uses cache on second call', async () => {
        mockPrisma.bot.findUnique.mockResolvedValue({ platform: 'WHATSAPP' });
        await providerRegistry.forBot('bot-cached');
        await providerRegistry.forBot('bot-cached');
        // Only one DB call — second one hits cache
        expect(mockPrisma.bot.findUnique).toHaveBeenCalledTimes(1);
    });

    it('forBot() throws if bot not found', async () => {
        mockPrisma.bot.findUnique.mockResolvedValue(null);
        await expect(providerRegistry.forBot('nonexistent')).rejects.toThrow('Bot not found: nonexistent');
    });

    it('invalidateCache() forces re-lookup on next forBot()', async () => {
        mockPrisma.bot.findUnique.mockResolvedValue({ platform: 'WHATSAPP' });
        await providerRegistry.forBot('bot-inv');
        providerRegistry.invalidateCache('bot-inv');
        await providerRegistry.forBot('bot-inv');
        expect(mockPrisma.bot.findUnique).toHaveBeenCalledTimes(2);
    });

    it('shutdownAll() calls shutdownAll on each unique provider', async () => {
        const p1 = createMockProvider();
        const p2 = createMockProvider();
        providerRegistry.register('WHATSAPP' as any, p1);
        providerRegistry.register('WHATSAPP_CLOUD' as any, p2);
        await providerRegistry.shutdownAll();
        expect(p1.shutdownAll).toHaveBeenCalledOnce();
        expect(p2.shutdownAll).toHaveBeenCalledOnce();
    });
});
