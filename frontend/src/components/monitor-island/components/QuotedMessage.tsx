import React from 'react';
import type { Message } from '../types';

interface QuotedRef {
    id: string;
    content?: string;
    fromMe?: boolean;
    sender?: string;
}

interface Props {
    quoted: QuotedRef;
    messages: Message[];
}

export function QuotedMessage({ quoted, messages }: Props) {
    const scrollToQuoted = () => {
        const target = messages.find(m => m.externalId === quoted.id);
        if (target) {
            const el = document.getElementById(`msg-${target.id}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el?.classList.add('ring-1', 'ring-wa-green/50');
            setTimeout(() => el?.classList.remove('ring-1', 'ring-wa-green/50'), 2000);
        }
    };

    return (
        <div
            onClick={scrollToQuoted}
            className={`mx-1 mt-1 mb-1 px-2.5 py-1.5 rounded-lg border-l-4 cursor-pointer ${
                quoted.fromMe ? 'bg-wa-green/10 border-wa-green' : 'bg-white/5 border-blue-400'
            }`}
        >
            <span className={`text-[10px] font-semibold block mb-0.5 ${quoted.fromMe ? 'text-wa-green' : 'text-blue-400'}`}>
                {quoted.fromMe ? 'Tu' : (quoted.sender?.split('@')[0] || '')}
            </span>
            <span className="text-xs text-wa-text-secondary line-clamp-2">
                {quoted.content || '[media]'}
            </span>
        </div>
    );
}
