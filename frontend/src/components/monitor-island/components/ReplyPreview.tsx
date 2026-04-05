import React from 'react';
import { useMonitor } from '../MonitorProvider';

export function ReplyPreview() {
    const { state, dispatch } = useMonitor();
    if (!state.replyingTo) return null;

    const msg = state.replyingTo;

    return (
        <div className="bg-wa-bg-header px-2 sm:px-4 pt-2 flex items-center gap-2 flex-shrink-0 border-t border-wa-border">
            <div className="flex-1 rounded-lg px-3 py-2 border-l-4 border-wa-green bg-wa-green/5 min-w-0">
                <span className="text-[10px] font-semibold text-wa-green block">
                    {msg.fromMe ? 'Tu' : (msg.sender?.split('@')[0] || 'Mensaje')}
                </span>
                <span className="text-xs text-wa-text-secondary truncate block">
                    {msg.content || '[media]'}
                </span>
            </div>
            <button onClick={() => dispatch({ type: 'SET_FIELD', field: 'replyingTo', value: null })} className="text-wa-text-secondary hover:text-red-400 transition-colors p-1 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
