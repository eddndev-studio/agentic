/**
 * Provider Registry — resolves the correct IMessagingProvider for a given platform or bot.
 *
 * Usage:
 *   import { providerRegistry } from './providers/registry';
 *
 *   // When you know the platform:
 *   const provider = providerRegistry.get(Platform.WHATSAPP);
 *
 *   // When you only have a botId:
 *   const provider = await providerRegistry.forBot(botId);
 */
import { Platform } from '@prisma/client';
import { prisma } from '../services/postgres.service';
import type { IMessagingProvider } from './types';
import { baileysProvider } from './baileys.adapter';
import { wabaProvider } from './waba.adapter';

// ── Provider map ─────────────────────────────────────────────────────────────
const providers = new Map<Platform, IMessagingProvider>();
providers.set(Platform.WHATSAPP, baileysProvider);
providers.set(Platform.WHATSAPP_CLOUD, wabaProvider);

// ── Bot → Platform cache (platform rarely changes) ──────────────────────────
const platformCache = new Map<string, Platform>();

export const providerRegistry = {
    /**
     * Get provider by platform enum. Throws if no provider registered.
     */
    get(platform: Platform): IMessagingProvider {
        const provider = providers.get(platform);
        if (!provider) {
            throw new Error(`No messaging provider registered for platform: ${platform}`);
        }
        return provider;
    },

    /**
     * Get provider for a specific bot (resolves platform from DB, cached).
     */
    async forBot(botId: string): Promise<IMessagingProvider> {
        let platform = platformCache.get(botId);
        if (!platform) {
            const bot = await prisma.bot.findUnique({
                where: { id: botId },
                select: { platform: true },
            });
            if (!bot) throw new Error(`Bot not found: ${botId}`);
            platform = bot.platform;
            platformCache.set(botId, platform);
        }
        return this.get(platform);
    },

    /**
     * Invalidate cached platform for a bot (call when bot platform changes).
     */
    invalidateCache(botId: string): void {
        platformCache.delete(botId);
    },

    /**
     * Shutdown all registered providers gracefully.
     */
    async shutdownAll(): Promise<void> {
        const seen = new Set<IMessagingProvider>();
        for (const provider of providers.values()) {
            if (seen.has(provider)) continue;
            seen.add(provider);
            await provider.shutdownAll();
        }
    },

    /**
     * Register a new provider for a platform (used in tests or for new platforms).
     */
    register(platform: Platform, provider: IMessagingProvider): void {
        providers.set(platform, provider);
    },
};
