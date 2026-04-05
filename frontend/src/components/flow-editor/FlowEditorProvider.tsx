import React, { createContext, useContext } from 'react';
import { useFlowState } from './hooks/useFlowState';

type FlowStateType = ReturnType<typeof useFlowState>;

const FlowEditorContext = createContext<FlowStateType | null>(null);

export function useFlowEditor() {
    const ctx = useContext(FlowEditorContext);
    if (!ctx) throw new Error('useFlowEditor must be used within FlowEditorProvider');
    return ctx;
}

export function FlowEditorProvider({ children }: { children: React.ReactNode }) {
    const state = useFlowState();

    if (!state.ready) {
        return (
            <div className="flex items-center justify-center h-full text-wa-green text-xs font-mono">
                Loading...
            </div>
        );
    }

    return (
        <FlowEditorContext.Provider value={state}>
            {children}
        </FlowEditorContext.Provider>
    );
}
