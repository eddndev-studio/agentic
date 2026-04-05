import React, { memo, useState } from 'react';
import { useMonitor } from '../MonitorProvider';
import { MessageMedia } from './MessageMedia';
import { QuotedMessage } from './QuotedMessage';
import { ReactionBadges } from './ReactionBadges';
import { isLastInGroup, shortTime, formatMessage, getMediaUrl } from '../../../lib/monitor/format-helpers';
import type { Message } from '../types';

const REACTION_EMOJIS = ['👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '😡', '🙏', '🎉', '💯', '🤔'];

interface Props {
    msg: Message;
    idx: number;
}

export const MessageBubble = memo(function MessageBubble({ msg, idx }: Props) {
    const { state, dispatch, getReactions, reactToMessage, messageInputRef } = useMonitor();
    const [showReactPicker, setShowReactPicker] = useState(false);

    const messages = state.messages;
    const lastInGroup = isLastInGroup(messages, idx);
    const mediaUrl = getMediaUrl(msg);
    const hasVisualMedia = mediaUrl && ['IMAGE', 'VIDEO', 'STICKER'].includes(msg.type);
    const reactions = getReactions(msg.externalId);

    return (
        <div>
            {/* Message row */}
            <div
                className={`flex mb-[2px] group/msg transition-all duration-300 ${msg.fromMe ? 'justify-end' : 'justify-start'} ${lastInGroup ? 'mb-2' : ''}`}
                id={`msg-${msg.id}`}
            >
                {/* Action buttons */}
                <div className={`flex items-end gap-0 ${msg.fromMe ? 'order-first' : 'order-last'}`}>
                    {/* Reply */}
                    <button
                        onClick={() => { dispatch({ type: 'SET_FIELD', field: 'replyingTo', value: msg }); messageInputRef.current?.focus(); }}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-wa-text-secondary hover:text-white hover:bg-wa-bg-hover transition-all sm:opacity-0 sm:group-hover/msg:opacity-100"
                        title="Responder"
                    >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                    </button>
                    {/* React */}
                    <div className="relative">
                        <button
                            onClick={() => setShowReactPicker(!showReactPicker)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-wa-text-secondary hover:text-white hover:bg-wa-bg-hover transition-all sm:opacity-0 sm:group-hover/msg:opacity-100"
                        >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </button>
                        {showReactPicker && (
                            <div
                                className={`absolute bottom-full mb-1 z-50 bg-wa-bg-header border border-wa-border rounded-2xl shadow-lg px-1 py-1 flex flex-wrap gap-0.5 w-max max-w-[200px] ${
                                    msg.fromMe ? 'right-0' : 'left-0'
                                }`}
                            >
                                {REACTION_EMOJIS.map(emoji => (
                                    <button
                                        key={emoji}
                                        onClick={() => { reactToMessage(msg.id, emoji); setShowReactPicker(false); }}
                                        className="w-8 h-8 flex items-center justify-center text-lg hover:scale-125 active:scale-110 transition-transform rounded-full hover:bg-wa-bg-hover"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Bubble */}
                <div
                    className={[
                        'relative max-w-[88%] sm:max-w-[80%] md:max-w-[70%] lg:max-w-[65%] text-sm break-words shadow-sm overflow-hidden',
                        msg.fromMe ? 'bg-wa-bubble-out text-white' : 'bg-wa-bubble-in text-white',
                        lastInGroup
                            ? (msg.fromMe ? 'rounded-lg rounded-br-none wa-bubble-tail-out' : 'rounded-lg rounded-bl-none wa-bubble-tail-in')
                            : 'rounded-lg',
                        hasVisualMedia ? '' : 'px-2.5 py-1.5',
                    ].join(' ')}
                >
                    {/* Quoted message */}
                    {msg.metadata?.quotedMessage?.id && (
                        <QuotedMessage quoted={msg.metadata.quotedMessage} messages={messages} />
                    )}

                    {/* Media content */}
                    <MessageMedia msg={msg} mediaUrl={mediaUrl} />

                    {/* Text + time + checks */}
                    <div className={hasVisualMedia ? (msg.content ? 'px-2.5 pt-1.5 pb-1.5 border-t border-white/5' : 'px-2.5 py-1') : ''}>
                        {msg.content && msg.content !== '[media]' && (
                            <span className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                        )}
                        <span className="inline-flex items-center gap-1 float-right ml-2 mt-1 text-[11px] text-wa-text-secondary align-bottom leading-none translate-y-0.5">
                            <span>{shortTime(msg.createdAt)}</span>
                            {msg.fromMe && (
                                <svg className="w-4 h-4 wa-check-blue" viewBox="0 0 16 15" fill="currentColor">
                                    <path d="M15.01 3.316l-.478-.372a.365.365 0 00-.51.063L8.666 9.88 5.64 6.3a.365.365 0 00-.519-.033l-.438.399a.376.376 0 00-.037.527l3.605 4.19a.515.515 0 00.4.2.514.514 0 00.4-.2l6.024-7.56a.376.376 0 00-.065-.507z" />
                                    <path d="M12.33 3.316l-.478-.372a.365.365 0 00-.51.063L5.986 9.88 4.96 8.65a.365.365 0 00-.519-.033l-.438.399a.376.376 0 00-.037.527l2.1 2.442a.515.515 0 00.4.2.514.514 0 00.4-.2l6.024-7.56a.376.376 0 00-.065-.507z" opacity=".75" />
                                </svg>
                            )}
                        </span>
                    </div>
                </div>

                {/* Reactions */}
                <ReactionBadges reactions={reactions} fromMe={msg.fromMe} messageId={msg.id} />
            </div>
        </div>
    );
});
