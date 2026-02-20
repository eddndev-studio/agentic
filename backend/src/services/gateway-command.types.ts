export type CommandType =
    | "START_SESSION"
    | "STOP_SESSION"
    | "SEND_MESSAGE"
    | "FORCE_AI"
    | "SYNC_LABELS"
    | "ADD_CHAT_LABEL"
    | "REMOVE_CHAT_LABEL";

export interface GatewayCommand {
    id: string;
    type: CommandType;
    botId: string;
    payload: Record<string, any>;
    replyTo: string; // Redis key for response: "cmd:reply:{id}"
}

export interface CommandResponse {
    success: boolean;
    data?: any;
    error?: string;
}
