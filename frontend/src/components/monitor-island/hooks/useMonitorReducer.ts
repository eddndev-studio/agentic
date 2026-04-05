import type { MonitorState, MonitorAction, Session } from '../types';

export const initialState: MonitorState = {
    botId: null,
    botName: '',
    sessions: [],
    selectedSessionId: null,
    messages: [],
    messageInput: '',
    searchQuery: '',
    filterLabelId: '',

    sending: false,
    showScrollDown: false,
    showNotesPanel: false,
    sessionNotes: '',
    showEmojiPicker: false,
    showQuickReplies: false,
    replyingTo: null,

    attachments: [],
    uploadingFile: false,

    showForceAIModal: false,
    showFlowModal: false,
    showToolModal: false,
    showDebugPanel: false,
    debugData: null,
    loadingDebug: false,
    forceAIContext: '',
    selectedFlowId: '',
    selectedToolName: '',
    toolArgsJson: '{}',

    flows: [],
    tools: [],
    botLabels: [],

    loadingMore: false,
    hasMoreMessages: true,
    messageLimit: 80,
    sessionLimit: 50,
    sessionOffset: 0,
    hasMoreSessions: false,
    loadingMoreSessions: false,
    sessionsLoaded: false,
    totalSessions: 0,

    lastMessageCount: 0,
    timeTick: 0,
    unreadCounts: {},
    typingSessions: {},
};

/** Bump session to top of list */
function bumpSession(sessions: Session[], sessionId: string, patch: Partial<Session>): Session[] {
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx < 0) return sessions;
    const updated = { ...sessions[idx], ...patch, updatedAt: new Date().toISOString() };
    if (idx === 0) return [updated, ...sessions.slice(1)];
    return [updated, ...sessions.slice(0, idx), ...sessions.slice(idx + 1)];
}

/** Patch a session in place without reordering */
function patchSession(sessions: Session[], sessionId: string, patch: Partial<Session>): Session[] {
    return sessions.map(s => s.id === sessionId ? { ...s, ...patch } : s);
}

export function monitorReducer(state: MonitorState, action: MonitorAction): MonitorState {
    switch (action.type) {
        case 'SET_BOT':
            return { ...state, botId: action.botId, botName: action.botName };

        case 'SET_SESSIONS':
            return {
                ...state,
                sessions: action.sessions,
                totalSessions: action.total,
                hasMoreSessions: action.sessions.length < action.total,
                sessionOffset: 0,
                sessionsLoaded: true,
            };

        case 'APPEND_SESSIONS': {
            const existingIds = new Set(state.sessions.map(s => s.id));
            const newSessions = action.sessions.filter(s => !existingIds.has(s.id));
            const combined = [...state.sessions, ...newSessions];
            return {
                ...state,
                sessions: combined,
                totalSessions: action.total,
                hasMoreSessions: combined.length < action.total,
                loadingMoreSessions: false,
            };
        }

        case 'SELECT_SESSION':
            return {
                ...state,
                selectedSessionId: action.sessionId,
                sessionNotes: action.notes,
                showNotesPanel: false,
                messages: [],
                hasMoreMessages: true,
                loadingMore: false,
                replyingTo: null,
                showEmojiPicker: false,
                showQuickReplies: false,
                unreadCounts: { ...state.unreadCounts, [action.sessionId]: 0 },
            };

        case 'DESELECT_SESSION':
            return { ...state, selectedSessionId: null };

        case 'UPDATE_SESSION':
            return { ...state, sessions: patchSession(state.sessions, action.sessionId, action.patch) };

        case 'SET_MESSAGES':
            return {
                ...state,
                messages: action.messages,
                lastMessageCount: action.total,
                hasMoreMessages: action.messages.length < action.total,
            };

        case 'PREPEND_MESSAGES': {
            const combined = [...action.messages, ...state.messages];
            return {
                ...state,
                messages: combined,
                hasMoreMessages: combined.length < action.total,
                loadingMore: false,
            };
        }

        case 'APPEND_MESSAGES': {
            const existingIds = new Set(state.messages.map(m => m.id));
            const newMsgs = action.messages.filter(m => !existingIds.has(m.id));
            if (newMsgs.length === 0) return state;
            return { ...state, messages: [...state.messages, ...newMsgs] };
        }

        case 'SET_FIELD':
            return { ...state, [action.field]: action.value };

        case 'ADD_ATTACHMENT':
            return { ...state, attachments: [...state.attachments, action.attachment] };

        case 'REMOVE_ATTACHMENT':
            return { ...state, attachments: state.attachments.filter((_, i) => i !== action.index) };

        case 'CLEAR_ATTACHMENTS':
            return { ...state, attachments: [] };

        case 'SET_BOT_LABELS':
            return { ...state, botLabels: action.labels };

        case 'ASSIGN_LABEL': {
            const sessions = patchSession(state.sessions, action.sessionId, {
                labels: [...(state.sessions.find(s => s.id === action.sessionId)?.labels ?? []), action.label],
            });
            return { ...state, sessions };
        }

        case 'REMOVE_LABEL': {
            const sessions = patchSession(state.sessions, action.sessionId, {
                labels: (state.sessions.find(s => s.id === action.sessionId)?.labels ?? [])
                    .filter(l => l.id !== action.labelId),
            });
            return { ...state, sessions };
        }

        case 'SHOW_FLOW_MODAL':
            return { ...state, showFlowModal: true, flows: action.flows, selectedFlowId: '' };

        case 'SHOW_TOOL_MODAL':
            return { ...state, showToolModal: true, tools: action.tools, selectedToolName: '', toolArgsJson: '{}' };

        case 'SET_DEBUG_DATA':
            return { ...state, debugData: action.data, loadingDebug: false };

        case 'CLEAR_AFTER_SEND':
            return {
                ...state,
                messageInput: '',
                replyingTo: null,
                attachments: [],
                sending: false,
            };

        case 'TICK_TIME':
            return { ...state, timeTick: state.timeTick + 1 };

        // ── SSE Events ───────────────────────────────────

        case 'SSE_MESSAGE_RECEIVED': {
            const isActiveSession = state.selectedSessionId === action.sessionId;
            const alreadyExists = state.messages.some(m => m.id === action.message.id);

            let messages = state.messages;
            if (isActiveSession && !alreadyExists) {
                messages = [...state.messages, action.message];
            }

            const sessions = bumpSession(state.sessions, action.sessionId, {
                lastMessage: action.message,
                messageCount: (state.sessions.find(s => s.id === action.sessionId)?.messageCount ?? 0) + 1,
            });

            const unreadCounts = isActiveSession
                ? state.unreadCounts
                : { ...state.unreadCounts, [action.sessionId]: (state.unreadCounts[action.sessionId] ?? 0) + 1 };

            return { ...state, messages, sessions, unreadCounts };
        }

        case 'SSE_MESSAGE_SENT': {
            const sessions = bumpSession(state.sessions, action.sessionId, {
                lastMessage: { content: action.content, fromMe: true, type: 'TEXT', createdAt: new Date().toISOString() },
            });
            return { ...state, sessions };
        }

        case 'SSE_SESSION_CREATED': {
            if (state.sessions.some(s => s.id === action.session.id)) return state;
            return { ...state, sessions: [action.session, ...state.sessions] };
        }

        case 'SSE_SESSION_LABELS':
            return { ...state, sessions: patchSession(state.sessions, action.sessionId, { labels: action.labels }) };

        case 'SSE_SESSION_UPDATED':
            return { ...state, sessions: patchSession(state.sessions, action.sessionId, { name: action.name }) };

        case 'SET_TYPING':
            return { ...state, typingSessions: { ...state.typingSessions, [action.sessionId]: action.typing } };

        case 'INCREMENT_UNREAD':
            return {
                ...state,
                unreadCounts: {
                    ...state.unreadCounts,
                    [action.sessionId]: (state.unreadCounts[action.sessionId] ?? 0) + 1,
                },
            };

        case 'CLEAR_UNREAD':
            return { ...state, unreadCounts: { ...state.unreadCounts, [action.sessionId]: 0 } };

        default:
            return state;
    }
}
