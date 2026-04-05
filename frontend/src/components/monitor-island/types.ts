// ── Domain Types ───────────────────────────���──────────────

export type MessageType =
    | 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT'
    | 'STICKER' | 'PTT' | 'REACTION' | 'CONTACT' | 'LOCATION' | 'POLL';

export interface MessageMetadata {
    mediaUrl?: string;
    latitude?: number;
    longitude?: number;
    options?: string[];
    quotedMessage?: {
        id: string;
        content?: string;
        fromMe?: boolean;
        sender?: string;
    };
    reactedTo?: { id: string };
    reactionTargetId?: string;
}

export interface Message {
    id: string;
    externalId?: string;
    sessionId: string;
    content?: string;
    type: MessageType;
    fromMe: boolean;
    sender?: string;
    metadata?: MessageMetadata;
    createdAt: string;
}

export interface SessionLabel {
    id: string;
    name: string;
    color: number;
    waLabelId?: string;
}

export interface Label extends SessionLabel {
    sessionCount?: number;
}

export interface Session {
    id: string;
    botId: string;
    identifier: string;
    name?: string;
    status?: string;
    aiEnabled: boolean;
    notes?: string;
    labels?: SessionLabel[];
    lastMessage?: Pick<Message, 'content' | 'fromMe' | 'type' | 'createdAt'>;
    messageCount?: number;
    updatedAt: string;
    createdAt: string;
}

export interface Attachment {
    file: File;
    url: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
    preview: string | null;
}

export interface Flow {
    id: string;
    name: string;
}

export interface Tool {
    id: string;
    name: string;
}

export interface DebugData {
    config: {
        aiProvider: string;
        aiModel: string;
        temperature: number;
        contextMessages: number;
        autoReadReceipts: boolean;
    };
    systemPrompt: string;
    chatContext: string[];
    conversationHistory: Array<{
        role: 'user' | 'assistant' | 'tool' | 'system';
        content?: string;
        toolCalls?: Array<{ name: string }>;
    }>;
}

export interface ReactionGroup {
    emoji: string;
    count: number;
}

// ── State Shape ──────────────────────────────────────────

export interface MonitorState {
    // Core
    botId: string | null;
    botName: string;
    sessions: Session[];
    selectedSessionId: string | null;
    messages: Message[];
    messageInput: string;
    searchQuery: string;
    filterLabelId: string;

    // UI
    sending: boolean;
    showScrollDown: boolean;
    showNotesPanel: boolean;
    sessionNotes: string;
    showEmojiPicker: boolean;
    showQuickReplies: boolean;
    replyingTo: Message | null;

    // Attachments
    attachments: Attachment[];
    uploadingFile: boolean;

    // Admin modals
    showForceAIModal: boolean;
    showFlowModal: boolean;
    showToolModal: boolean;
    showDebugPanel: boolean;
    debugData: DebugData | null;
    loadingDebug: boolean;
    forceAIContext: string;
    selectedFlowId: string;
    selectedToolName: string;
    toolArgsJson: string;

    // Reference data
    flows: Flow[];
    tools: Tool[];
    botLabels: Label[];

    // Pagination
    loadingMore: boolean;
    hasMoreMessages: boolean;
    messageLimit: number;
    sessionLimit: number;
    sessionOffset: number;
    hasMoreSessions: boolean;
    loadingMoreSessions: boolean;
    sessionsLoaded: boolean;
    totalSessions: number;

    // Real-time
    lastMessageCount: number;
    timeTick: number;
    unreadCounts: Record<string, number>;
    typingSessions: Record<string, boolean>;
}

// ── Reducer Actions ──────────────────────────────────────

export type MonitorAction =
    | { type: 'SET_BOT'; botId: string; botName: string }
    | { type: 'SET_SESSIONS'; sessions: Session[]; total: number }
    | { type: 'APPEND_SESSIONS'; sessions: Session[]; total: number }
    | { type: 'SELECT_SESSION'; sessionId: string; notes: string }
    | { type: 'DESELECT_SESSION' }
    | { type: 'UPDATE_SESSION'; sessionId: string; patch: Partial<Session> }
    | { type: 'SET_MESSAGES'; messages: Message[]; total: number }
    | { type: 'PREPEND_MESSAGES'; messages: Message[]; total: number }
    | { type: 'APPEND_MESSAGES'; messages: Message[] }
    | { type: 'SET_FIELD'; field: keyof MonitorState; value: unknown }
    | { type: 'ADD_ATTACHMENT'; attachment: Attachment }
    | { type: 'REMOVE_ATTACHMENT'; index: number }
    | { type: 'CLEAR_ATTACHMENTS' }
    | { type: 'SET_BOT_LABELS'; labels: Label[] }
    | { type: 'ASSIGN_LABEL'; sessionId: string; label: SessionLabel }
    | { type: 'REMOVE_LABEL'; sessionId: string; labelId: string }
    | { type: 'SHOW_FLOW_MODAL'; flows: Flow[] }
    | { type: 'SHOW_TOOL_MODAL'; tools: Tool[] }
    | { type: 'SET_DEBUG_DATA'; data: DebugData | null }
    | { type: 'CLEAR_AFTER_SEND' }
    | { type: 'TICK_TIME' }
    | { type: 'SSE_MESSAGE_RECEIVED'; sessionId: string; message: Message }
    | { type: 'SSE_MESSAGE_SENT'; sessionId: string; content: string }
    | { type: 'SSE_SESSION_CREATED'; session: Session }
    | { type: 'SSE_SESSION_LABELS'; sessionId: string; labels: SessionLabel[] }
    | { type: 'SSE_SESSION_UPDATED'; sessionId: string; name: string }
    | { type: 'SET_TYPING'; sessionId: string; typing: boolean }
    | { type: 'INCREMENT_UNREAD'; sessionId: string }
    | { type: 'CLEAR_UNREAD'; sessionId: string };
