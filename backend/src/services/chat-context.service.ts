import { prisma } from "./postgres.service";
import { safeParseMessageMetadata } from "../schemas";

interface ContextMessage {
    content: string | null;
    type: string;
    fromMe: boolean;
    createdAt: Date;
    metadata: unknown;
}

/**
 * Format a message for chat context display.
 */
export function formatContextMessage(m: ContextMessage): string {
    const time = new Date(m.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
    const sender = m.fromMe ? "Bot" : "Cliente";
    const caption = m.content || "";
    const desc = safeParseMessageMetadata(m.metadata).mediaDescription || "";

    let text: string;
    switch (m.type) {
        case "TEXT":
            text = caption || "[mensaje vacío]";
            break;
        case "IMAGE":
            if (desc && caption) text = `[Imagen: ${desc}] ${caption}`;
            else if (desc) text = `[Imagen: ${desc}]`;
            else if (caption) text = `[Imagen adjunta] ${caption}`;
            else text = "[Imagen adjunta]";
            break;
        case "AUDIO":
            text = desc ? `[Audio: ${desc}]` : "[Audio recibido]";
            break;
        case "VIDEO":
            if (desc && caption) text = `[Video: ${desc}] ${caption}`;
            else if (caption) text = `[Video adjunto] ${caption}`;
            else text = "[Video adjunto]";
            break;
        case "DOCUMENT":
            if (desc) text = `[Documento: ${desc}]`;
            else if (caption) text = `[Documento] ${caption}`;
            else text = "[Documento adjunto]";
            break;
        case "PTT":
            text = desc ? `[Nota de voz: ${desc}]` : "[Nota de voz]";
            break;
        case "STICKER":
            text = "[Sticker]";
            break;
        case "REACTION":
            text = caption ? `[Reacción: ${caption}]` : "[Quitó reacción]";
            break;
        case "CONTACT":
            text = caption ? `[Contacto: ${caption}]` : "[Contacto compartido]";
            break;
        case "LOCATION":
            text = "[Ubicación compartida]";
            break;
        case "POLL":
            text = caption ? `[Encuesta: ${caption}]` : "[Encuesta]";
            break;
        default:
            text = caption || `[${m.type.toLowerCase()}]`;
    }

    return `[${time} ${sender}] ${text}`;
}

/**
 * Fetch and format the last N messages for a session as chat context lines.
 */
export async function buildChatContext(sessionId: string, count: number): Promise<string[]> {
    if (count <= 0) return [];

    const messages = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
        take: count,
        select: { content: true, type: true, fromMe: true, createdAt: true, metadata: true },
    });

    if (messages.length === 0) return [];

    return messages.reverse().map(m => formatContextMessage(m));
}
