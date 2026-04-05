import React from 'react';
import { useMonitor } from '../MonitorProvider';
import type { ReactionGroup } from '../types';

interface Props {
    reactions: ReactionGroup[];
    fromMe: boolean;
    messageId: string;
}

export function ReactionBadges({ reactions, fromMe, messageId }: Props) {
    const { reactToMessage } = useMonitor();
    if (reactions.length === 0) return null;

    return (
        <div className={`flex gap-1 mt-0.5 px-1 -mt-1 ${fromMe ? 'justify-end' : 'justify-start'}`}>
            {reactions.map(r => (
                <button
                    key={r.emoji}
                    onClick={() => reactToMessage(messageId, r.emoji)}
                    className="inline-flex items-center gap-0.5 bg-wa-bg-header border border-wa-border rounded-full px-1.5 py-0.5 text-xs shadow-sm hover:border-wa-green/50 hover:bg-wa-bg-hover transition-colors cursor-pointer"
                >
                    <span>{r.emoji}</span>
                    {r.count > 1 && <span className="text-[10px] text-wa-text-secondary">{r.count}</span>}
                </button>
            ))}
        </div>
    );
}
