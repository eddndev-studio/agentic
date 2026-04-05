import React, { useEffect, useCallback } from 'react';
import { useMonitor } from '../MonitorProvider';
import { SessionList } from './SessionList';
import { ChatPanel } from './ChatPanel';
import { ForceAIModal } from './modals/ForceAIModal';
import { RunFlowModal } from './modals/RunFlowModal';
import { RunToolModal } from './modals/RunToolModal';
import { DebugPanel } from './modals/DebugPanel';

export function MonitorApp() {
    const { state, dispatch, searchInputRef } = useMonitor();

    // Keyboard shortcuts
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (state.showEmojiPicker) {
                dispatch({ type: 'SET_FIELD', field: 'showEmojiPicker', value: false });
            } else if (state.showNotesPanel) {
                dispatch({ type: 'SET_FIELD', field: 'showNotesPanel', value: false });
            } else if (state.showQuickReplies) {
                dispatch({ type: 'SET_FIELD', field: 'showQuickReplies', value: false });
            } else if (state.selectedSessionId) {
                dispatch({ type: 'DESELECT_SESSION' });
            }
        }
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            searchInputRef.current?.focus();
        }
    }, [state.showEmojiPicker, state.showNotesPanel, state.showQuickReplies, state.selectedSessionId, dispatch, searchInputRef]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div className="h-full flex overflow-hidden md:rounded-lg">
            <SessionList />
            <ChatPanel />
            <ForceAIModal />
            <RunFlowModal />
            <RunToolModal />
            <DebugPanel />
        </div>
    );
}
