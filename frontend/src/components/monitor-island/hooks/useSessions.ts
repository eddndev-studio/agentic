import { useCallback, useEffect, type Dispatch } from 'react';
import { ApiClient } from '../../../lib/api';
import type { MonitorState, MonitorAction } from '../types';

function buildSessionParams(state: MonitorState): URLSearchParams {
    const params = new URLSearchParams();
    if (state.botId) params.append('botId', state.botId);
    if (state.searchQuery) params.append('search', state.searchQuery);
    if (state.filterLabelId) params.append('labelId', state.filterLabelId);
    params.append('limit', String(state.sessionLimit));
    return params;
}

export function useSessions(state: MonitorState, dispatch: Dispatch<MonitorAction>) {
    const { botId, sessionLimit } = state;

    const loadSessions = useCallback(async () => {
        if (!botId) return;
        try {
            const params = buildSessionParams(state);
            params.append('offset', '0');
            const res = await ApiClient.get(`/sessions?${params.toString()}`);
            dispatch({ type: 'SET_SESSIONS', sessions: res.data ?? [], total: res.pagination?.total ?? 0 });
        } catch (e) { console.error('Failed to load sessions', e); }
    }, [botId, state.searchQuery, state.filterLabelId, sessionLimit, dispatch]);

    const loadMoreSessions = useCallback(async () => {
        if (state.loadingMoreSessions || !state.hasMoreSessions) return;
        dispatch({ type: 'SET_FIELD', field: 'loadingMoreSessions', value: true });
        try {
            const newOffset = state.sessionOffset + sessionLimit;
            dispatch({ type: 'SET_FIELD', field: 'sessionOffset', value: newOffset });
            const params = buildSessionParams(state);
            params.append('offset', String(newOffset));
            const res = await ApiClient.get(`/sessions?${params.toString()}`);
            dispatch({ type: 'APPEND_SESSIONS', sessions: res.data ?? [], total: res.pagination?.total ?? 0 });
        } catch (e) {
            console.error('Failed to load more sessions', e);
            dispatch({ type: 'SET_FIELD', field: 'loadingMoreSessions', value: false });
        }
    }, [state.loadingMoreSessions, state.hasMoreSessions, state.sessionOffset, sessionLimit, botId, state.searchQuery, state.filterLabelId, dispatch]);

    const onSessionsScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
            loadMoreSessions();
        }
    }, [loadMoreSessions]);

    const selectSession = useCallback(async (sessionId: string, notes: string) => {
        dispatch({ type: 'SELECT_SESSION', sessionId, notes });
        ApiClient.post(`/sessions/${sessionId}/mark-read`, {}).catch(() => {});
    }, [dispatch]);

    // Load sessions on mount and when search/filter changes
    useEffect(() => {
        if (botId) loadSessions();
    }, [botId, loadSessions]);

    return { loadSessions, loadMoreSessions, onSessionsScroll, selectSession };
}
