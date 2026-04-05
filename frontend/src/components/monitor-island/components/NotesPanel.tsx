import React from 'react';
import { useMonitor } from '../MonitorProvider';

export function NotesPanel() {
    const { state, dispatch, saveNotes } = useMonitor();
    if (!state.showNotesPanel) return null;

    return (
        <div className="bg-wa-bg-deep border-b border-wa-border px-4 py-2.5 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
                <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="text-[10px] text-purple-400 uppercase tracking-wider font-medium">Notas</span>
                <button onClick={() => dispatch({ type: 'SET_FIELD', field: 'showNotesPanel', value: false })} className="ml-auto text-wa-text-secondary hover:text-white text-sm">
                    &times;
                </button>
            </div>
            <textarea
                value={state.sessionNotes}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'sessionNotes', value: e.target.value })}
                onBlur={saveNotes}
                rows={2}
                className="w-full bg-wa-bg-hover border border-wa-border text-wa-text-primary text-xs p-2 rounded-lg focus:border-purple-400 focus:outline-none resize-y"
                placeholder="Escribe notas sobre este contacto..."
            />
        </div>
    );
}
