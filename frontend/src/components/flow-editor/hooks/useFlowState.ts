import { useState, useEffect, useCallback } from 'react';
import { ApiClient } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import type { Flow, Step, Trigger } from '../lib/types';

interface Bot {
    id: string | null;
    platform?: string;
    identifier?: string;
}

interface AvailableFlow {
    id: string;
    name: string;
}

interface Label {
    id: string;
    name: string;
    color: number;
}

interface FlowState {
    flow: Flow;
    bot: Bot;
    ready: boolean;
    saving: boolean;
    flowId: string | null;
    botId: string | null;
    templateId: string | null;
    availableTools: { name: string }[];
    availableFlows: AvailableFlow[];
    botLabels: Label[];
    templateVarDefs: { name: string; type: string }[];
    setFlow: (flow: Flow) => void;
    updateStep: (index: number, step: Step) => void;
    addStep: (type: string) => void;
    removeStep: (index: number) => void;
    updateTriggers: (triggers: Trigger[]) => void;
    save: () => Promise<void>;
}

export function useFlowState(): FlowState {
    const [flow, setFlow] = useState<Flow>({
        name: '', description: '', usageLimit: 0, cooldownMs: 0,
        excludesFlows: [], triggers: [], steps: [],
    });
    const [bot, setBot] = useState<Bot>({ id: null });
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [flowId, setFlowId] = useState<string | null>(null);
    const [botId, setBotId] = useState<string | null>(null);
    const [templateId, setTemplateId] = useState<string | null>(null);
    const [availableTools, setAvailableTools] = useState<{ name: string }[]>([]);
    const [availableFlows, setAvailableFlows] = useState<AvailableFlow[]>([]);
    const [botLabels, setBotLabels] = useState<Label[]>([]);
    const [templateVarDefs, setTemplateVarDefs] = useState<{ name: string; type: string }[]>([]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        const bId = params.get('botId');
        const tId = params.get('templateId');

        setFlowId(id);
        setBotId(bId);
        setTemplateId(tId);

        if (id && id !== 'new') {
            loadFlow(id);
        } else if (bId) {
            ApiClient.get(`/bots/${bId}`).then(b => setBot(b)).catch(() => {});
            setFlow(f => ({ ...f, name: 'New Flow' }));
            setReady(true);
            loadTools(bId);
            loadLabels(bId);
        } else if (tId) {
            loadTemplateVarDefs(tId);
            setFlow(f => ({ ...f, name: 'New Flow' }));
            setReady(true);
        } else {
            window.location.href = '/bots';
        }
    }, []);

    async function loadFlow(id: string) {
        try {
            const res = await ApiClient.get(`/flows/${id}`);
            setFlow(res);
            if (res.templateId) {
                setTemplateId(res.templateId);
                loadTemplateVarDefs(res.templateId);
            } else if (res.botId) {
                setBotId(res.botId);
                setBot({ id: res.botId });
                ApiClient.get(`/bots/${res.botId}`).then(b => setBot(b)).catch(() => {});
                loadTools(res.botId);
                loadLabels(res.botId);
                loadFlows(res.botId, id);
            }
            setReady(true);
        } catch {
            toast.error('Failed to load flow');
            window.location.href = '/bots';
        }
    }

    async function loadTools(bId: string) {
        try {
            const tools = await ApiClient.get(`/tools?botId=${bId}`);
            setAvailableTools(tools.filter((t: any) => t.status === 'ACTIVE'));
        } catch {}
    }

    async function loadLabels(bId: string) {
        try {
            setBotLabels(await ApiClient.get(`/sessions/labels?botId=${bId}`));
        } catch {}
    }

    async function loadFlows(bId: string, currentId: string) {
        try {
            const flows = await ApiClient.get(`/flows?botId=${bId}`);
            setAvailableFlows(flows.filter((f: any) => f.id !== currentId));
        } catch {}
    }

    async function loadTemplateVarDefs(tId: string) {
        try {
            const tpl = await ApiClient.get(`/templates/${tId}`);
            setTemplateVarDefs(Array.isArray(tpl.variables) ? tpl.variables : []);
        } catch {}
    }

    const updateStep = useCallback((index: number, step: Step) => {
        setFlow(f => {
            const steps = [...f.steps];
            steps[index] = step;
            return { ...f, steps };
        });
    }, []);

    const addStep = useCallback((type: string) => {
        setFlow(f => {
            const step: Step = {
                tempId: Date.now(),
                type,
                content: '',
                mediaUrl: '',
                delayMs: 1000,
                jitterPct: 10,
                aiOnly: false,
                order: f.steps.length,
                ...(type === 'TOOL' ? { metadata: { toolName: '', toolArgs: {} } } : {}),
            };
            return { ...f, steps: [...f.steps, step] };
        });
    }, []);

    const removeStep = useCallback((index: number) => {
        setFlow(f => {
            const steps = f.steps.filter((_, i) => i !== index);
            steps.forEach((s, i) => s.order = i);
            return { ...f, steps };
        });
    }, []);

    const updateTriggers = useCallback((triggers: Trigger[]) => {
        setFlow(f => ({ ...f, triggers }));
    }, []);

    const save = useCallback(async () => {
        if (!flow.name) { toast.error('Name required'); return; }
        setSaving(true);
        try {
            const payload = {
                ...flow,
                steps: flow.steps.map((s, i) => ({
                    ...s,
                    order: i,
                    delayMs: parseInt(String(s.delayMs), 10) || 1000,
                    jitterPct: parseInt(String(s.jitterPct), 10) || 10,
                })),
            };

            if (!flowId || flowId === 'new') {
                const res = await ApiClient.post('/flows', {
                    ...payload,
                    ...(templateId ? { templateId } : { botId }),
                });
                window.location.href = `/editor?id=${res.id}`;
            } else {
                await ApiClient.put(`/flows/${flowId}`, payload);
                toast.success('Saved!');
            }
        } catch (e) {
            toast.error('Error saving flow');
            console.error(e);
        } finally {
            setSaving(false);
        }
    }, [flow, flowId, botId, templateId]);

    return {
        flow, bot, ready, saving, flowId, botId, templateId,
        availableTools, availableFlows, botLabels, templateVarDefs,
        setFlow, updateStep, addStep, removeStep, updateTriggers, save,
    };
}
