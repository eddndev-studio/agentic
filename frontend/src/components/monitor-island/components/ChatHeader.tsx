import React from 'react';
import { useMonitor } from '../MonitorProvider';
import { LabelPills } from './LabelPills';
import { AdminMenu } from './AdminMenu';
import { avatarInitials, avatarColor } from '../../../lib/monitor/format-helpers';

export function ChatHeader() {
    const { selectedSession, state, dispatch } = useMonitor();
    if (!selectedSession) return null;

    const displayName = selectedSession.name || selectedSession.identifier;
    const showIdentifier = selectedSession.name && selectedSession.identifier && selectedSession.name !== selectedSession.identifier;
    const formattedId = selectedSession.identifier?.split('@')[0]?.replace(/^(\d{2})(\d{2})(\d{4})(\d{4})$/, '+$1 $2 $3 $4');
    const isTyping = state.typingSessions[selectedSession.id] ?? false;

    return (
        <div className="h-14 bg-wa-bg-header flex items-center px-2 sm:px-4 gap-2 sm:gap-3 flex-shrink-0">
            {/* Back button (mobile) */}
            <button
                onClick={() => dispatch({ type: 'DESELECT_SESSION' })}
                className="md:hidden text-wa-text-secondary hover:text-wa-green transition-colors flex-shrink-0"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
            </button>

            {/* Avatar */}
            <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-semibold text-xs sm:text-sm flex-shrink-0"
                style={{ background: avatarColor(displayName) }}
            >
                {avatarInitials(displayName)}
            </div>

            {/* Name + status */}
            <div className="flex-1 min-w-0">
                <div className="font-medium text-[15px] text-wa-text-primary truncate">{displayName}</div>
                <div className="text-[11px] text-wa-text-secondary flex items-center gap-2">
                    {showIdentifier && <span className="font-mono">{formattedId}</span>}
                    {isTyping ? (
                        <span className="text-wa-green">escribiendo...</span>
                    ) : (
                        <span>{selectedSession.status === 'CONNECTED' ? 'en línea' : 'desconectado'}</span>
                    )}
                </div>
            </div>

            {/* Labels (desktop) */}
            <LabelPills />

            {/* Admin menu */}
            <AdminMenu />
        </div>
    );
}
