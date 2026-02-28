import type { AIToolDefinition } from "../../services/ai";

/**
 * Registry of built-in tools that are always available to every bot.
 * These are injected at runtime — no DB record needed.
 */
export const BUILTIN_TOOLS: AIToolDefinition[] = [
    {
        name: "get_current_time",
        description: "Obtiene la fecha y hora actual en la zona horaria especificada.",
        parameters: {
            type: "object",
            properties: {
                timezone: { type: "string", description: "Zona horaria IANA (default: America/Mexico_City)" },
            },
        },
    },
    {
        name: "clear_conversation",
        description: "Limpia el historial de conversación de la sesión actual.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "get_labels",
        description: "Obtiene todas las etiquetas disponibles del bot con la cantidad de chats asignados.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "assign_label",
        description: "Asigna una etiqueta existente al chat actual.",
        parameters: {
            type: "object",
            properties: {
                label_name: { type: "string", description: "Nombre de la etiqueta a asignar" },
            },
            required: ["label_name"],
        },
    },
    {
        name: "remove_label",
        description: "Remueve una etiqueta del chat actual.",
        parameters: {
            type: "object",
            properties: {
                label_name: { type: "string", description: "Nombre de la etiqueta a remover" },
            },
            required: ["label_name"],
        },
    },
    {
        name: "get_sessions_by_label",
        description: "Busca todos los chats que tienen una etiqueta específica, con sus últimos mensajes.",
        parameters: {
            type: "object",
            properties: {
                label_name: { type: "string", description: "Nombre de la etiqueta a buscar" },
                include_messages: { type: "number", description: "Cantidad de mensajes recientes a incluir (default: 5)" },
            },
            required: ["label_name"],
        },
    },
    {
        name: "reply_to_message",
        description: "Responde citando un mensaje específico del usuario (quote-reply de WhatsApp). Usa el message_id proporcionado en el formato [msg:ID].",
        parameters: {
            type: "object",
            properties: {
                message_id: { type: "string", description: "ID del mensaje a citar (el valor después de [msg:] en el contexto)" },
                text: { type: "string", description: "Texto de la respuesta" },
            },
            required: ["message_id", "text"],
        },
    },
    {
        name: "send_followup_message",
        description: "Envía un mensaje de seguimiento a otra sesión/chat del bot.",
        parameters: {
            type: "object",
            properties: {
                session_id: { type: "string", description: "ID de la sesión destino" },
                message: { type: "string", description: "Texto del mensaje a enviar" },
            },
            required: ["session_id", "message"],
        },
    },
    {
        name: "toggle_session_ai",
        description: "Activa o desactiva el procesamiento de AI para la sesión actual.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "activate_session_ai",
        description: "Activa el procesamiento de AI para la sesión actual.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "deactivate_session_ai",
        description: "Desactiva el procesamiento de AI para la sesión actual.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "set_notification_channel",
        description: "Marca la sesión actual como canal de notificaciones del bot. Las notificaciones del sistema se enviarán a este chat.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "notify",
        description: "Envía un mensaje al canal de notificaciones configurado del bot.",
        parameters: {
            type: "object",
            properties: {
                message: { type: "string", description: "Texto del mensaje de notificación" },
                priority: {
                    type: "string",
                    enum: ["low", "normal", "high"],
                    description: "Prioridad de la notificación (default: normal)",
                },
            },
            required: ["message"],
        },
    },
];

/** Set of all built-in tool names for fast collision checks */
export const BUILTIN_TOOL_NAMES: Set<string> = new Set(
    BUILTIN_TOOLS.map((t) => t.name)
);

/** Check if a tool name is a built-in */
export function isBuiltinTool(name: string): boolean {
    return BUILTIN_TOOL_NAMES.has(name);
}
