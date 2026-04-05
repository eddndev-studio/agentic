import { useCallback, useEffect, type Dispatch, type RefObject } from 'react';
import { ApiClient } from '../../../lib/api';
import { detectMediaType } from '../../../lib/monitor/format-helpers';
import { toast } from '../../../lib/toast';
import type { MonitorState, MonitorAction, Attachment } from '../types';

export function useMessages(
    state: MonitorState,
    dispatch: Dispatch<MonitorAction>,
    messagesContainerRef: RefObject<HTMLDivElement | null>,
) {
    const { selectedSessionId, messageLimit } = state;

    const scrollToBottom = useCallback(() => {
        const el = messagesContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messagesContainerRef]);

    const loadMessages = useCallback(async (merge = false) => {
        if (!selectedSessionId) return;
        try {
            const res = await ApiClient.get(`/sessions/${selectedSessionId}/messages?limit=${messageLimit}`);
            if (merge && state.messages.length > 0) {
                const existingIds = new Set(state.messages.map(m => m.id));
                const newMsgs = (res.data ?? []).filter((m: any) => !existingIds.has(m.id));
                if (newMsgs.length > 0) {
                    dispatch({ type: 'APPEND_MESSAGES', messages: newMsgs });
                    requestAnimationFrame(scrollToBottom);
                }
                dispatch({ type: 'SET_FIELD', field: 'lastMessageCount', value: res.pagination.total });
                dispatch({ type: 'SET_FIELD', field: 'hasMoreMessages', value: state.messages.length + newMsgs.length < res.pagination.total });
            } else {
                dispatch({ type: 'SET_MESSAGES', messages: res.data, total: res.pagination.total });
                requestAnimationFrame(scrollToBottom);
            }
        } catch (e) { console.error('Failed to load messages', e); }
    }, [selectedSessionId, messageLimit, state.messages, dispatch, scrollToBottom]);

    const loadMoreMessages = useCallback(async () => {
        if (!selectedSessionId || state.loadingMore || !state.hasMoreMessages) return;
        dispatch({ type: 'SET_FIELD', field: 'loadingMore', value: true });
        const container = messagesContainerRef.current;
        const prevHeight = container?.scrollHeight ?? 0;
        try {
            const offset = state.messages.length;
            const res = await ApiClient.get(`/sessions/${selectedSessionId}/messages?limit=${messageLimit}&offset=${offset}`);
            if (res.data.length === 0) {
                dispatch({ type: 'SET_FIELD', field: 'hasMoreMessages', value: false });
                dispatch({ type: 'SET_FIELD', field: 'loadingMore', value: false });
            } else {
                dispatch({ type: 'PREPEND_MESSAGES', messages: res.data, total: res.pagination.total });
                // Restore scroll position after prepending older messages
                requestAnimationFrame(() => {
                    if (container) container.scrollTop = container.scrollHeight - prevHeight;
                });
            }
        } catch (e) {
            console.error('Failed to load more messages', e);
            dispatch({ type: 'SET_FIELD', field: 'loadingMore', value: false });
        }
    }, [selectedSessionId, state.loadingMore, state.hasMoreMessages, state.messages.length, messageLimit, messagesContainerRef, dispatch]);

    const onChatScroll = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        if (container.scrollTop < 100 && state.hasMoreMessages && !state.loadingMore) {
            loadMoreMessages();
        }
        dispatch({
            type: 'SET_FIELD',
            field: 'showScrollDown',
            value: (container.scrollHeight - container.scrollTop - container.clientHeight) > 200,
        });
    }, [state.hasMoreMessages, state.loadingMore, loadMoreMessages, messagesContainerRef, dispatch]);

    const sendMessage = useCallback(async () => {
        const hasFiles = state.attachments.length > 0;
        if (!state.messageInput.trim() && !hasFiles) return;
        if (!selectedSessionId) return;

        dispatch({ type: 'SET_FIELD', field: 'sending', value: true });
        try {
            const sessionUrl = `/sessions/${selectedSessionId}/send`;
            const caption = state.messageInput.trim();
            const replyId = state.replyingTo?.id;

            if (hasFiles) {
                for (let i = 0; i < state.attachments.length; i++) {
                    const att = state.attachments[i];
                    const isLast = i === state.attachments.length - 1;
                    const payload: Record<string, unknown> = {
                        mediaUrl: att.url,
                        mediaType: att.mediaType,
                        fileName: att.file.name,
                    };
                    if (isLast && caption) payload.text = caption;
                    if (i === 0 && replyId) payload.quotedMessageId = replyId;
                    await ApiClient.post(sessionUrl, payload);
                }
            } else {
                const payload: Record<string, unknown> = { text: caption };
                if (replyId) payload.quotedMessageId = replyId;
                await ApiClient.post(sessionUrl, payload);
            }

            dispatch({ type: 'CLEAR_AFTER_SEND' });
            setTimeout(() => loadMessages(true), 1500);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            toast.error('Send failed: ' + msg);
            dispatch({ type: 'SET_FIELD', field: 'sending', value: false });
        }
    }, [selectedSessionId, state.messageInput, state.attachments, state.replyingTo, dispatch, loadMessages]);

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        dispatch({ type: 'SET_FIELD', field: 'uploadingFile', value: true });
        try {
            for (const file of Array.from(files)) {
                const res = await ApiClient.uploadFile(file);
                const mediaType = detectMediaType(file) as Attachment['mediaType'];
                const preview = ['IMAGE', 'VIDEO'].includes(mediaType) ? URL.createObjectURL(file) : null;
                dispatch({ type: 'ADD_ATTACHMENT', attachment: { file, url: res.url, mediaType, preview } });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown';
            toast.error('Upload failed: ' + msg);
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'uploadingFile', value: false });
            e.target.value = '';
        }
    }, [dispatch]);

    const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
        const files = Array.from(e.clipboardData?.files ?? []);
        if (files.length === 0) return;
        e.preventDefault();

        dispatch({ type: 'SET_FIELD', field: 'uploadingFile', value: true });
        try {
            for (const file of files) {
                const res = await ApiClient.uploadFile(file);
                const mediaType = detectMediaType(file) as Attachment['mediaType'];
                const preview = ['IMAGE', 'VIDEO'].includes(mediaType) ? URL.createObjectURL(file) : null;
                dispatch({ type: 'ADD_ATTACHMENT', attachment: { file, url: res.url, mediaType, preview } });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown';
            toast.error('Paste upload failed: ' + msg);
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'uploadingFile', value: false });
        }
    }, [dispatch]);

    const removeAttachment = useCallback((index: number) => {
        const att = state.attachments[index];
        if (att?.preview) URL.revokeObjectURL(att.preview);
        dispatch({ type: 'REMOVE_ATTACHMENT', index });
    }, [state.attachments, dispatch]);

    const clearAttachments = useCallback(() => {
        for (const att of state.attachments) {
            if (att.preview) URL.revokeObjectURL(att.preview);
        }
        dispatch({ type: 'CLEAR_ATTACHMENTS' });
    }, [state.attachments, dispatch]);

    const reactToMessage = useCallback(async (messageId: string, emoji: string) => {
        if (!selectedSessionId) return;
        try {
            await ApiClient.post(`/sessions/${selectedSessionId}/react`, { messageId, emoji });
            setTimeout(() => loadMessages(true), 1000);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown';
            toast.error('Reaction failed: ' + msg);
        }
    }, [selectedSessionId, loadMessages]);

    // Load messages when session changes
    useEffect(() => {
        if (selectedSessionId) loadMessages();
    }, [selectedSessionId]);  // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            for (const att of state.attachments) {
                if (att.preview) URL.revokeObjectURL(att.preview);
            }
        };
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    return {
        loadMessages,
        loadMoreMessages,
        onChatScroll,
        scrollToBottom,
        sendMessage,
        handleFileSelect,
        handlePaste,
        removeAttachment,
        clearAttachments,
        reactToMessage,
    };
}
