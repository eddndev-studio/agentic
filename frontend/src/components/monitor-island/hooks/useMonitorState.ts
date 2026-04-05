import { useReducer, useEffect, useMemo, useRef, useCallback, type Dispatch } from 'react';
import { monitorReducer, initialState } from './useMonitorReducer';
import { useSessions } from './useSessions';
import { useMessages } from './useMessages';
import { useAdminActions } from './useAdminActions';
import { useSSE } from './useSSE';
import { useTimers } from './useTimers';
import { ApiClient } from '../../../lib/api';
import { buildReactionsMap } from '../../../lib/monitor/format-helpers';
import type { MonitorState, MonitorAction, ReactionGroup } from '../types';

export interface MonitorContext {
    state: MonitorState;
    dispatch: Dispatch<MonitorAction>;
    // Derived
    selectedSession: MonitorState['sessions'][number] | null;
    reactionsMap: Record<string, string[]>;
    getReactions: (externalId?: string) => ReactionGroup[];
    availableLabels: MonitorState['botLabels'];
    isAdmin: boolean;
    // Refs
    messagesContainerRef: React.RefObject<HTMLDivElement | null>;
    messageInputRef: React.RefObject<HTMLInputElement | null>;
    searchInputRef: React.RefObject<HTMLInputElement | null>;
    // Session actions
    loadSessions: () => Promise<void>;
    loadMoreSessions: () => Promise<void>;
    onSessionsScroll: (e: React.UIEvent<HTMLDivElement>) => void;
    selectSession: (sessionId: string, notes: string) => Promise<void>;
    // Message actions
    loadMessages: (merge?: boolean) => Promise<void>;
    loadMoreMessages: () => Promise<void>;
    onChatScroll: () => void;
    scrollToBottom: () => void;
    sendMessage: () => Promise<void>;
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    handlePaste: (e: React.ClipboardEvent) => Promise<void>;
    removeAttachment: (index: number) => void;
    clearAttachments: () => void;
    reactToMessage: (messageId: string, emoji: string) => Promise<void>;
    // Admin actions
    saveNotes: () => Promise<void>;
    toggleAI: () => Promise<void>;
    forceAI: () => Promise<void>;
    openFlowModal: () => Promise<void>;
    executeFlow: () => Promise<void>;
    openToolModal: () => Promise<void>;
    executeTool: () => Promise<void>;
    loadDebugContext: () => Promise<void>;
    assignLabel: (labelId: string) => Promise<void>;
    removeLabel: (labelId: string) => Promise<void>;
}

export function useMonitorState(): MonitorContext {
    const [state, dispatch] = useReducer(monitorReducer, initialState);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Derived values
    const selectedSession = useMemo(
        () => state.sessions.find(s => s.id === state.selectedSessionId) ?? null,
        [state.sessions, state.selectedSessionId],
    );

    const reactionsMap = useMemo(
        () => buildReactionsMap(state.messages),
        [state.messages],
    );

    const getReactions = useCallback((externalId?: string): ReactionGroup[] => {
        if (!externalId) return [];
        const emojis = reactionsMap[externalId];
        if (!emojis || emojis.length === 0) return [];
        const counts: Record<string, number> = {};
        for (const e of emojis) counts[e] = (counts[e] || 0) + 1;
        return Object.entries(counts).map(([emoji, count]) => ({ emoji, count }));
    }, [reactionsMap]);

    const availableLabels = useMemo(() => {
        if (!selectedSession) return [];
        const assignedIds = new Set((selectedSession.labels ?? []).map(l => l.id));
        return state.botLabels.filter(l => !assignedIds.has(l.id));
    }, [selectedSession, state.botLabels]);

    const isAdmin = useMemo(() => {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            return user.role === 'OWNER' || user.role === 'ADMIN';
        } catch { return false; }
    }, []);

    // Compose sub-hooks
    const sessionActions = useSessions(state, dispatch);
    const messageActions = useMessages(state, dispatch, messagesContainerRef);
    const adminActions = useAdminActions(state, dispatch);

    // SSE + timers
    useSSE(state.botId, state.selectedSessionId, dispatch);
    useTimers(state.botId, state.selectedSessionId, state.messageLimit, dispatch);

    // Init: load bot info, sessions, labels
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const botId = params.get('botId') || params.get('id');
        if (!botId) return;

        dispatch({ type: 'SET_BOT', botId, botName: '' });

        ApiClient.get(`/bots/${botId}`)
            .then(bot => dispatch({ type: 'SET_BOT', botId, botName: bot.name }))
            .catch(() => {});

        ApiClient.get(`/sessions/labels?botId=${botId}`)
            .then(labels => dispatch({ type: 'SET_BOT_LABELS', labels }))
            .catch(() => {});
    }, []);

    return {
        state,
        dispatch,
        selectedSession,
        reactionsMap,
        getReactions,
        availableLabels,
        isAdmin,
        messagesContainerRef,
        messageInputRef,
        searchInputRef,
        ...sessionActions,
        ...messageActions,
        ...adminActions,
    };
}
