import { eventBus, type BotEvent } from "./event-bus";
import { prisma } from "./postgres.service";
import { BaileysService } from "./baileys.service";

const EVENT_LABELS: Record<string, string> = {
    "flow:started":       "Flujo iniciado",
    "flow:completed":     "Flujo completado",
    "flow:failed":        "Flujo fallido",
    "session:created":    "Sesión creada",
    "session:labels":     "Etiquetas actualizadas",
    "bot:connected":      "Bot conectado",
    "bot:disconnected":   "Bot desconectado",
    "tool:executed":      "Herramienta ejecutada",
};

const IGNORED_EVENTS = new Set(['bot:qr', 'message:sent', 'session:updated', 'message:received']);

interface ChannelConfig {
    sessionId: string;
    events: string[];
    labels: string[];
}

interface CachedConfig {
    channels: ChannelConfig[];
    botName: string;
    botIdentifier: string;
    expiresAt: number;
}

class NotificationService {
    private cache = new Map<string, CachedConfig>();
    private CACHE_TTL = 30_000;

    init() {
        eventBus.subscribeAll((event) => {
            this.handleEvent(event).catch(err => {
                console.error(`[NotificationService] Error handling ${event.type}:`, err.message);
            });
        });
        console.log("[NotificationService] Initialized");
    }

    invalidateCache(botId: string) {
        this.cache.delete(botId);
    }

    private async getConfig(botId: string): Promise<CachedConfig> {
        const cached = this.cache.get(botId);
        if (cached && cached.expiresAt > Date.now()) return cached;

        const bot = await prisma.bot.findUnique({
            where: { id: botId },
            select: { name: true, identifier: true, notificationChannels: true },
        });

        const raw = bot?.notificationChannels;
        const channels: ChannelConfig[] = Array.isArray(raw) ? raw as ChannelConfig[] : [];

        const config: CachedConfig = {
            channels,
            botName: bot?.name || 'Bot',
            botIdentifier: bot?.identifier || '',
            expiresAt: Date.now() + this.CACHE_TTL,
        };

        this.cache.set(botId, config);
        return config;
    }

    private async handleEvent(event: BotEvent) {
        if (IGNORED_EVENTS.has(event.type)) return;

        const config = await this.getConfig(event.botId);
        if (config.channels.length === 0) return;

        // Resolve session name for events that carry a sessionId
        let sessionName: string | undefined;
        if ('sessionId' in event && event.sessionId) {
            const src = await prisma.session.findUnique({
                where: { id: event.sessionId },
                select: { name: true, identifier: true },
            });
            sessionName = src?.name || src?.identifier?.split('@')[0] || undefined;
        }

        const message = this.formatMessage(event, config, sessionName);
        if (!message) return;

        // Send to each channel that is subscribed to this event
        for (const channel of config.channels) {
            if (channel.events.length === 0) continue;
            if (!channel.events.includes(event.type)) continue;

            // Per-label filtering for this channel
            if (event.type === 'session:labels' && event.changedLabelId && channel.labels.length > 0) {
                if (!channel.labels.includes(event.changedLabelId)) continue;
            }

            const session = await prisma.session.findUnique({ where: { id: channel.sessionId } });
            if (!session) continue;

            try {
                await BaileysService.sendMessage(event.botId, session.identifier, { text: message });

                await prisma.message.create({
                    data: {
                        sessionId: session.id,
                        content: message,
                        fromMe: true,
                        type: "TEXT",
                        externalId: `sysnotif_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                        sender: session.identifier || "bot",
                    },
                });
            } catch (err: any) {
                console.error(`[NotificationService] Failed to send for ${event.type} to ${session.identifier}:`, err.message);
            }
        }
    }

    private formatMessage(event: BotEvent, config: CachedConfig, sessionName?: string): string | null {
        const label = EVENT_LABELS[event.type] || event.type;
        const ts = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
        const botLine = `\nBot: ${config.botName} (${config.botIdentifier})`;
        const chatLine = sessionName ? `\nChat: ${sessionName}` : '';

        switch (event.type) {
            case 'flow:started':
                return `\u{1F4CB} *${label}*${botLine}\nFlujo: ${event.flowName}${chatLine}\n\u{1F550} ${ts}`;
            case 'flow:completed':
                return `\u2705 *${label}*${botLine}\nFlujo: ${event.flowName}${chatLine}\n\u{1F550} ${ts}`;
            case 'flow:failed':
                return `\u274C *${label}*${botLine}\nFlujo: ${event.flowName}${chatLine}\nError: ${event.error}\n\u{1F550} ${ts}`;
            case 'session:created':
                return `\u{1F464} *${label}*${botLine}\nNombre: ${event.session?.name || 'Desconocido'}\nIdentificador: ${event.session?.identifier || 'N/A'}\n\u{1F550} ${ts}`;
            case 'session:labels': {
                const changedLabel = event.changedLabelId
                    ? event.labels.find((l: any) => l.id === event.changedLabelId)
                    : null;
                const actionText = event.action === 'add' ? 'asignada' : event.action === 'remove' ? 'removida' : 'actualizada';
                const detail = changedLabel
                    ? `Etiqueta: ${changedLabel.name} (${actionText})`
                    : `Etiquetas: ${event.labels.map((l: any) => l.name).join(', ') || 'ninguna'}`;
                return `\u{1F3F7}\uFE0F *${label}*${botLine}${chatLine}\n${detail}\n\u{1F550} ${ts}`;
            }
            case 'bot:connected':
                return `\u{1F7E2} *${label}*${botLine}\n\u{1F550} ${ts}`;
            case 'bot:disconnected':
                return `\u{1F534} *${label}*${botLine}\nCódigo: ${event.statusCode ?? 'N/A'}\n\u{1F550} ${ts}`;
            case 'tool:executed':
                return `\u{1F527} *${label}*${botLine}\nHerramienta: ${event.toolName}${chatLine}\nResultado: ${event.success ? '\u2705 Éxito' : '\u274C Error'}\n\u{1F550} ${ts}`;
            default:
                return null;
        }
    }
}

export const notificationService = new NotificationService();
