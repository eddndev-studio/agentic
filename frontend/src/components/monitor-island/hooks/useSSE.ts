import { useEffect, useRef, type Dispatch } from 'react';
import { BotEventSource } from '../../../lib/events';
import { playNotifSound } from '../../../lib/monitor/format-helpers';
import type { MonitorAction } from '../types';

export function useSSE(
    botId: string | null,
    selectedSessionId: string | null,
    dispatch: Dispatch<MonitorAction>,
) {
    // Use refs for values that change frequently but don't need to recreate the SSE connection
    const selectedSessionIdRef = useRef(selectedSessionId);
    selectedSessionIdRef.current = selectedSessionId;

    const typingTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        if (!botId) return;

        const client = new BotEventSource(botId);

        client
            .on('message:received', (data: any) => {
                if (!data.message) return;
                const activeSessionId = selectedSessionIdRef.current;
                // SSE_MESSAGE_RECEIVED atomically: appends msg (if active session), bumps session, updates unread
                dispatch({ type: 'SSE_MESSAGE_RECEIVED', sessionId: data.sessionId, message: data.message });
                // Play sound for messages in other sessions
                if ((!activeSessionId || data.sessionId !== activeSessionId) && !data.message.fromMe) {
                    playNotifSound();
                }
            })
            .on('message:sent', (data: any) => {
                dispatch({ type: 'SSE_MESSAGE_SENT', sessionId: data.sessionId, content: data.content ?? '' });
            })
            .on('session:created', (data: any) => {
                if (data.session?.id) {
                    dispatch({ type: 'SSE_SESSION_CREATED', session: data.session });
                }
            })
            .on('session:labels', (data: any) => {
                dispatch({ type: 'SSE_SESSION_LABELS', sessionId: data.sessionId, labels: data.labels ?? [] });
            })
            .on('session:updated', (data: any) => {
                dispatch({ type: 'SSE_SESSION_UPDATED', sessionId: data.sessionId, name: data.name ?? '' });
            })
            .on('session:typing', (data: any) => {
                // Find session by identifier
                const identifier = data.identifier;
                if (!identifier) return;

                // We need sessionId, but SSE gives us identifier. Store a dispatch with identifier
                // The reducer will need sessions to resolve this. Instead, dispatch a generic typing event.
                // We'll handle this with a custom approach: dispatch with identifier and resolve in component.
                // For simplicity, dispatch SET_TYPING with a pseudo-ID that components can match.
                // Actually, let's just store by identifier and resolve in the component.
                // Better approach: dispatch the raw data, let the component resolve.
                if (data.typing) {
                    dispatch({ type: 'SET_TYPING', sessionId: data.sessionId ?? identifier, typing: true });
                    // Clear typing after 5s
                    const key = data.sessionId ?? identifier;
                    if (typingTimeouts.current[key]) clearTimeout(typingTimeouts.current[key]);
                    typingTimeouts.current[key] = setTimeout(() => {
                        dispatch({ type: 'SET_TYPING', sessionId: key, typing: false });
                    }, 5000);
                } else {
                    const key = data.sessionId ?? identifier;
                    dispatch({ type: 'SET_TYPING', sessionId: key, typing: false });
                    if (typingTimeouts.current[key]) {
                        clearTimeout(typingTimeouts.current[key]);
                        delete typingTimeouts.current[key];
                    }
                }
            });

        client.connect();

        return () => {
            client.close();
            // Clear all typing timeouts
            for (const t of Object.values(typingTimeouts.current)) clearTimeout(t);
            typingTimeouts.current = {};
        };
    }, [botId, dispatch]);
}
