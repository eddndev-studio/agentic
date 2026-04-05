import { useEffect, useRef, type Dispatch } from 'react';
import { ApiClient } from '../../../lib/api';
import type { MonitorAction } from '../types';

export function useTimers(
    botId: string | null,
    selectedSessionId: string | null,
    messageLimit: number,
    dispatch: Dispatch<MonitorAction>,
) {
    const selectedSessionIdRef = useRef(selectedSessionId);
    selectedSessionIdRef.current = selectedSessionId;

    // Time tick for relative time updates (every 30s)
    useEffect(() => {
        const interval = setInterval(() => dispatch({ type: 'TICK_TIME' }), 30000);
        return () => clearInterval(interval);
    }, [dispatch]);

    // Poll fallback (every 60s)
    useEffect(() => {
        if (!botId) return;

        const interval = setInterval(async () => {
            // Reload sessions
            try {
                const params = new URLSearchParams();
                params.append('botId', botId);
                params.append('limit', '50');
                params.append('offset', '0');
                const res = await ApiClient.get(`/sessions?${params.toString()}`);
                dispatch({ type: 'SET_SESSIONS', sessions: res.data ?? [], total: res.pagination?.total ?? 0 });
            } catch {}

            // Reload messages for active session
            const activeId = selectedSessionIdRef.current;
            if (activeId) {
                try {
                    const res = await ApiClient.get(`/sessions/${activeId}/messages?limit=${messageLimit}`);
                    dispatch({ type: 'APPEND_MESSAGES', messages: res.data ?? [] });
                } catch {}
            }
        }, 60000);

        return () => clearInterval(interval);
    }, [botId, messageLimit, dispatch]);
}
