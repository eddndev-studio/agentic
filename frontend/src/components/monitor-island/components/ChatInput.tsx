import React, { useRef } from 'react';
import { useMonitor } from '../MonitorProvider';
import { ReplyPreview } from './ReplyPreview';
import { AttachmentPreview } from './AttachmentPreview';
import { QuickReplies } from './QuickReplies';
import { EmojiPicker } from './EmojiPicker';
import { t } from '../../../i18n';

export function ChatInput() {
    const {
        state, dispatch, sendMessage, handleFileSelect, handlePaste, messageInputRef,
    } = useMonitor();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { messageInput, attachments, sending, uploadingFile, showEmojiPicker, showQuickReplies } = state;

    return (
        <>
            <ReplyPreview />
            <AttachmentPreview fileInputRef={fileInputRef} />
            <QuickReplies />
            <EmojiPicker />

            {/* Input bar */}
            <div className="bg-wa-bg-header px-2 sm:px-4 py-2 flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                {/* Emoji button */}
                <button
                    onClick={() => { dispatch({ type: 'SET_FIELD', field: 'showEmojiPicker', value: !showEmojiPicker }); dispatch({ type: 'SET_FIELD', field: 'showQuickReplies', value: false }); }}
                    className={`flex w-9 h-9 sm:w-10 sm:h-10 rounded-full text-wa-text-secondary hover:text-wa-green hover:bg-wa-bg-hover items-center justify-center transition-colors flex-shrink-0 ${showEmojiPicker ? 'text-wa-green' : ''}`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </button>

                {/* Quick replies button */}
                <button
                    onClick={() => { dispatch({ type: 'SET_FIELD', field: 'showQuickReplies', value: !showQuickReplies }); dispatch({ type: 'SET_FIELD', field: 'showEmojiPicker', value: false }); }}
                    className={`flex w-9 h-9 sm:w-10 sm:h-10 rounded-full text-wa-text-secondary hover:text-wa-green hover:bg-wa-bg-hover items-center justify-center transition-colors flex-shrink-0 ${showQuickReplies ? 'text-wa-green' : ''}`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                </button>

                {/* Attach button */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full text-wa-text-secondary hover:text-wa-green hover:bg-wa-bg-hover flex items-center justify-center transition-colors flex-shrink-0"
                    disabled={uploadingFile}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
                    multiple
                />

                <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex-1 flex items-center gap-1.5 sm:gap-2">
                    <input
                        ref={messageInputRef}
                        type="text"
                        value={messageInput}
                        onChange={e => dispatch({ type: 'SET_FIELD', field: 'messageInput', value: e.target.value })}
                        onPaste={handlePaste}
                        className="flex-1 min-w-0 bg-wa-bg-hover text-wa-text-primary text-sm py-2 sm:py-2.5 px-3 sm:px-4 rounded-full focus:outline-none placeholder-wa-text-secondary"
                        placeholder={attachments.length > 0 ? 'Caption...' : t('type_message')}
                    />
                    <button
                        type="submit"
                        disabled={(!messageInput.trim() && attachments.length === 0) || sending || uploadingFile}
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-wa-green text-white flex items-center justify-center hover:bg-wa-green-hover transition-colors disabled:opacity-40 flex-shrink-0"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </form>
            </div>
        </>
    );
}
