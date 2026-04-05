import React from 'react';
import { useMonitor } from '../MonitorProvider';
import { EmptyState } from './EmptyState';
import { ChatHeader } from './ChatHeader';
import { NotesPanel } from './NotesPanel';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

export function ChatPanel() {
    const { selectedSession, state } = useMonitor();

    return (
        <div className={`flex-1 flex-col min-h-0 min-w-0 ${selectedSession ? 'flex' : 'hidden md:flex'}`}>
            {!selectedSession ? (
                <EmptyState />
            ) : (
                <div className="flex flex-col h-full min-h-0">
                    <ChatHeader />
                    <NotesPanel />
                    <MessageList />
                    <ChatInput />
                </div>
            )}
        </div>
    );
}
