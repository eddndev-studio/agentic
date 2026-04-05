import React, { createContext, useContext } from 'react';
import { useMonitorState, type MonitorContext } from './hooks/useMonitorState';

const MonitorCtx = createContext<MonitorContext | null>(null);

export function useMonitor(): MonitorContext {
    const ctx = useContext(MonitorCtx);
    if (!ctx) throw new Error('useMonitor must be used within MonitorProvider');
    return ctx;
}

export function MonitorProvider({ children }: { children: React.ReactNode }) {
    const store = useMonitorState();

    if (!store.state.botId) {
        return (
            <div className="flex items-center justify-center h-full text-wa-text-secondary text-xs font-mono">
                Loading...
            </div>
        );
    }

    return (
        <MonitorCtx.Provider value={store}>
            {children}
        </MonitorCtx.Provider>
    );
}
