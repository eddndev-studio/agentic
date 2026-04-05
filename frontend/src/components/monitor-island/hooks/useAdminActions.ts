import { useCallback, type Dispatch } from 'react';
import { ApiClient } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import type { MonitorState, MonitorAction } from '../types';

export function useAdminActions(state: MonitorState, dispatch: Dispatch<MonitorAction>) {
    const { selectedSessionId, botId } = state;

    const saveNotes = useCallback(async () => {
        if (!selectedSessionId) return;
        try {
            await ApiClient.patch(`/sessions/${selectedSessionId}/notes`, { notes: state.sessionNotes });
            dispatch({ type: 'UPDATE_SESSION', sessionId: selectedSessionId, patch: { notes: state.sessionNotes } });
        } catch { toast.error('Failed to save notes'); }
    }, [selectedSessionId, state.sessionNotes, dispatch]);

    const toggleAI = useCallback(async () => {
        if (!selectedSessionId) return;
        const session = state.sessions.find(s => s.id === selectedSessionId);
        if (!session) return;
        const newValue = !session.aiEnabled;
        try {
            await ApiClient.patch(`/sessions/${selectedSessionId}/ai-enabled`, { enabled: newValue });
            dispatch({ type: 'UPDATE_SESSION', sessionId: selectedSessionId, patch: { aiEnabled: newValue } });
            toast.info(newValue ? 'IA activada' : 'IA desactivada');
        } catch { toast.error('Failed to toggle AI'); }
    }, [selectedSessionId, state.sessions, dispatch]);

    const forceAI = useCallback(async () => {
        if (!selectedSessionId) return;
        try {
            await ApiClient.post(`/sessions/${selectedSessionId}/force-ai`, {
                context: state.forceAIContext || undefined,
            });
            dispatch({ type: 'SET_FIELD', field: 'showForceAIModal', value: false });
            dispatch({ type: 'SET_FIELD', field: 'forceAIContext', value: '' });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            toast.error('Force AI failed: ' + msg);
        }
    }, [selectedSessionId, state.forceAIContext, dispatch]);

    const openFlowModal = useCallback(async () => {
        if (!botId) return;
        try {
            const flows = await ApiClient.get(`/flows?botId=${botId}`);
            dispatch({ type: 'SHOW_FLOW_MODAL', flows });
        } catch {
            dispatch({ type: 'SHOW_FLOW_MODAL', flows: [] });
        }
    }, [botId, dispatch]);

    const executeFlow = useCallback(async () => {
        if (!selectedSessionId || !state.selectedFlowId) return;
        try {
            await ApiClient.post(`/sessions/${selectedSessionId}/execute-flow`, { flowId: state.selectedFlowId });
            dispatch({ type: 'SET_FIELD', field: 'showFlowModal', value: false });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            toast.error('Execute flow failed: ' + msg);
        }
    }, [selectedSessionId, state.selectedFlowId, dispatch]);

    const openToolModal = useCallback(async () => {
        if (!botId) return;
        try {
            const tools = await ApiClient.get(`/tools?botId=${botId}`);
            dispatch({ type: 'SHOW_TOOL_MODAL', tools });
        } catch {
            dispatch({ type: 'SHOW_TOOL_MODAL', tools: [] });
        }
    }, [botId, dispatch]);

    const executeTool = useCallback(async () => {
        if (!selectedSessionId || !state.selectedToolName) return;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(state.toolArgsJson); } catch {
            toast.error('Invalid JSON in arguments');
            return;
        }
        try {
            const res = await ApiClient.post(`/sessions/${selectedSessionId}/execute-tool`, {
                toolName: state.selectedToolName, args,
            });
            dispatch({ type: 'SET_FIELD', field: 'showToolModal', value: false });
            toast.info('Tool result: ' + JSON.stringify(res.result, null, 2));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            toast.error('Execute tool failed: ' + msg);
        }
    }, [selectedSessionId, state.selectedToolName, state.toolArgsJson, dispatch]);

    const loadDebugContext = useCallback(async () => {
        if (!selectedSessionId) return;
        dispatch({ type: 'SET_FIELD', field: 'loadingDebug', value: true });
        dispatch({ type: 'SET_FIELD', field: 'showDebugPanel', value: true });
        try {
            const data = await ApiClient.get(`/sessions/${selectedSessionId}/ai-context`);
            dispatch({ type: 'SET_DEBUG_DATA', data });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown';
            toast.error('Failed to load debug data: ' + msg);
            dispatch({ type: 'SET_FIELD', field: 'loadingDebug', value: false });
        }
    }, [selectedSessionId, dispatch]);

    const assignLabel = useCallback(async (labelId: string) => {
        if (!selectedSessionId) return;
        try {
            await ApiClient.post(`/sessions/${selectedSessionId}/labels`, { labelId });
            const label = state.botLabels.find(l => l.id === labelId);
            if (label) {
                dispatch({
                    type: 'ASSIGN_LABEL',
                    sessionId: selectedSessionId,
                    label: { id: label.id, name: label.name, color: label.color, waLabelId: label.waLabelId },
                });
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            toast.error('Assign label failed: ' + msg);
        }
    }, [selectedSessionId, state.botLabels, dispatch]);

    const removeLabel = useCallback(async (labelId: string) => {
        if (!selectedSessionId) return;
        try {
            await ApiClient.delete(`/sessions/${selectedSessionId}/labels/${labelId}`);
            dispatch({ type: 'REMOVE_LABEL', sessionId: selectedSessionId, labelId });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            toast.error('Remove label failed: ' + msg);
        }
    }, [selectedSessionId, dispatch]);

    return {
        saveNotes,
        toggleAI,
        forceAI,
        openFlowModal,
        executeFlow,
        openToolModal,
        executeTool,
        loadDebugContext,
        assignLabel,
        removeLabel,
    };
}
