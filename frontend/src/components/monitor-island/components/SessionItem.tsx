import React, { memo } from 'react';
import { avatarInitials, avatarColor, relativeTime, labelColor } from '../../../lib/monitor/format-helpers';
import type { Session } from '../types';

interface Props {
    session: Session;
    isSelected: boolean;
    unreadCount: number;
    isTyping: boolean;
    timeTick: number;
    onSelect: () => void;
}

export const SessionItem = memo(function SessionItem({ session: s, isSelected, unreadCount, isTyping, timeTick, onSelect }: Props) {
    const displayName = s.name || s.identifier;
    const showIdentifier = s.name && s.identifier && s.name !== s.identifier;
    const formattedId = s.identifier?.split('@')[0]?.replace(/^(\d{2})(\d{2})(\d{4})(\d{4})$/, '+$1 $2 $3 $4');

    return (
        <button
            onClick={onSelect}
            className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-wa-bg-hover transition-colors border-b border-wa-border/50 ${
                isSelected ? 'bg-wa-bg-hover' : ''
            }`}
        >
            {/* Avatar */}
            <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0"
                style={{ background: avatarColor(displayName) }}
            >
                {avatarInitials(displayName)}
            </div>

            <div className="flex-1 min-w-0">
                {/* Name + time */}
                <div className="flex justify-between items-baseline">
                    <span className={`text-[15px] truncate ${unreadCount > 0 ? 'font-bold text-white' : 'font-medium text-wa-text-primary'}`}>
                        {displayName}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <span className={`text-xs ${unreadCount > 0 ? 'text-wa-green font-medium' : 'text-wa-text-secondary'}`}>
                            {relativeTime(s.lastMessage?.createdAt || s.updatedAt, timeTick)}
                        </span>
                    </div>
                </div>

                {/* Phone number */}
                {showIdentifier && (
                    <div className="text-[11px] text-wa-text-secondary font-mono truncate">{formattedId}</div>
                )}

                {/* Last message + unread */}
                <div className="flex items-center gap-1 mt-0.5">
                    {s.lastMessage?.fromMe && (
                        <svg className="w-4 h-4 flex-shrink-0 wa-check-blue" viewBox="0 0 16 15" fill="currentColor">
                            <path d="M15.01 3.316l-.478-.372a.365.365 0 00-.51.063L8.666 9.88 5.64 6.3a.365.365 0 00-.519-.033l-.438.399a.376.376 0 00-.037.527l3.605 4.19a.515.515 0 00.4.2.514.514 0 00.4-.2l6.024-7.56a.376.376 0 00-.065-.507z" />
                            <path d="M12.33 3.316l-.478-.372a.365.365 0 00-.51.063L5.986 9.88 4.96 8.65a.365.365 0 00-.519-.033l-.438.399a.376.376 0 00-.037.527l2.1 2.442a.515.515 0 00.4.2.514.514 0 00.4-.2l6.024-7.56a.376.376 0 00-.065-.507z" opacity=".75" />
                        </svg>
                    )}
                    {isTyping ? (
                        <span className="text-sm text-wa-green italic">escribiendo...</span>
                    ) : (
                        <span className={`text-sm truncate ${unreadCount > 0 ? 'text-wa-text-primary font-medium' : 'text-wa-text-secondary'}`}>
                            {s.lastMessage?.content ?? ''}
                        </span>
                    )}
                    {unreadCount > 0 && (
                        <span className="ml-auto flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-wa-green text-white text-[11px] font-bold flex items-center justify-center">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </div>

                {/* Labels */}
                {(s.labels?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                        {s.labels!.map(lbl => (
                            <span
                                key={lbl.id}
                                className="text-[9px] px-1.5 py-0.5 rounded-full text-white/90"
                                style={{ background: labelColor(lbl.color) }}
                            >
                                {lbl.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </button>
    );
});
