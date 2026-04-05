import React from 'react';
import { useMonitor } from '../MonitorProvider';
import { MessageBubble } from './MessageBubble';
import { ScrollToBottom } from './ScrollToBottom';
import { dateLabel, showDateSep } from '../../../lib/monitor/format-helpers';
import { t } from '../../../i18n';

export function MessageList() {
    const { state, messagesContainerRef, onChatScroll, scrollToBottom } = useMonitor();
    const { messages, loadingMore, hasMoreMessages, showScrollDown } = state;

    return (
        <>
            <div
                ref={messagesContainerRef}
                onScroll={onChatScroll}
                className="flex-1 overflow-y-auto px-3 sm:px-[5%] md:px-[8%] lg:px-[10%] py-3 min-h-0 wa-chat-wallpaper"
            >
                {/* Load more indicator */}
                {loadingMore && (
                    <div className="flex justify-center py-3">
                        <span className="wa-date-pill">Cargando mensajes...</span>
                    </div>
                )}
                {!loadingMore && !hasMoreMessages && messages.length > 0 && (
                    <div className="flex justify-center py-3">
                        <span className="wa-date-pill">Inicio del chat</span>
                    </div>
                )}

                {messages.length === 0 && !loadingMore && (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-wa-text-secondary">{t('no_messages')}</p>
                    </div>
                )}

                {messages.map((msg, idx) => {
                    if (msg.type === 'REACTION') return null;
                    return (
                        <React.Fragment key={msg.id}>
                            {/* Date separator */}
                            {showDateSep(messages, idx) && (
                                <div className="flex justify-center my-3">
                                    <span className="wa-date-pill">{dateLabel(msg.createdAt)}</span>
                                </div>
                            )}
                            <MessageBubble msg={msg} idx={idx} />
                        </React.Fragment>
                    );
                })}
            </div>

            <ScrollToBottom visible={showScrollDown} onClick={scrollToBottom} />
        </>
    );
}
