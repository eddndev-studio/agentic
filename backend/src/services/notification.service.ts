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

/** Events that should never trigger notifications */
const IGNORED_EVENTS = new Set(['bot:qr', 'message:sent', 'session:updated', 'message:received']);

interface CachedConfig {
    sessionId: string | null;
    events: string[];
    labels: string[];
    expiresAt: number;
}

class NotificationService {
    private cache = new Map<string, CachedConfig>();
    private CACHE_TTL = 30_000; // 30s

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

    private async getConfig(botId: string): Promise<{ sessionId: string | null; events: string[]; labels: string[] }> {
        const cached = this.cache.get(botId);
        if (cached && cached.expiresAt > Date.now()) {
            return { sessionId: cached.sessionId, events: cached.events, labels: cached.labels };
        }

        const bot = await prisma.bot.findUnique({
            where: { id: botId },
            select: { notificationSessionId: true, notificationEvents: true, notificationLabels: true },
        });

        const config = {
            sessionId: bot?.notificationSessionId || null,
            events: bot?.notificationEvents || [],
            labels: bot?.notificationLabels || [],
        };

        this.cache.set(botId, { ...config, expiresAt: Date.now() + this.CACHE_TTL });
        return config;
    }

    private async handleEvent(event: BotEvent) {
        if (IGNORED_EVENTS.has(event.type)) return;

        const config = await this.getConfig(event.botId);
        if (!config.sessionId || config.events.length === 0) return;
        if (!config.events.includes(event.type)) return;

        // Per-label filtering: if notificationLabels is configured, only notify for those labels
        if (event.type === 'session:labels' && event.changedLabelId && config.labels.length > 0) {
            if (!config.labels.includes(event.changedLabelId)) return;
        }

        const message = this.formatMessage(event);
        if (!message) return;

        const session = await prisma.session.findUnique({ where: { id: config.sessionId } });
        if (!session) return;

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
            console.error(`[NotificationService] Failed to send for ${event.type}:`, err.message);
        }
    }

    private formatMessage(event: BotEvent): string | null {
        const label = EVENT_LABELS[event.type] || event.type;
        const ts = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

        switch (event.type) {
            case 'flow:started':
                return `\u{1F4CB} *${label}*\nFlujo: ${event.flowName}\n\u{1F550} ${ts}`;
            case 'flow:completed':
                return `\u2705 *${label}*\nFlujo: ${event.flowName}\n\u{1F550} ${ts}`;
            case 'flow:failed':
                return `\u274C *${label}*\nFlujo: ${event.flowName}\nError: ${event.error}\n\u{1F550} ${ts}`;
            case 'session:created':
                return `\u{1F464} *${label}*\nNombre: ${event.session?.name || 'Desconocido'}\nIdentificador: ${event.session?.identifier || 'N/A'}\n\u{1F550} ${ts}`;
            case 'session:labels': {
                const changedLabel = event.changedLabelId
                    ? event.labels.find((l: any) => l.id === event.changedLabelId)
                    : null;
                const actionText = event.action === 'add' ? 'asignada' : event.action === 'remove' ? 'removida' : 'actualizada';
                const detail = changedLabel
                    ? `Etiqueta: ${changedLabel.name} (${actionText})`
                    : `Etiquetas: ${event.labels.map((l: any) => l.name).join(', ') || 'ninguna'}`;
                return `\u{1F3F7}\uFE0F *${label}*\n${detail}\n\u{1F550} ${ts}`;
            }
            case 'bot:connected':
                return `\u{1F7E2} *${label}*\n\u{1F550} ${ts}`;
            case 'bot:disconnected':
                return `\u{1F534} *${label}*\nCódigo: ${event.statusCode ?? 'N/A'}\n\u{1F550} ${ts}`;
            case 'tool:executed':
                return `\u{1F527} *${label}*\nHerramienta: ${event.toolName}\nResultado: ${event.success ? '\u2705 Éxito' : '\u274C Error'}\n\u{1F550} ${ts}`;
            default:
                return null;
        }
    }
}

export const notificationService = new NotificationService();
