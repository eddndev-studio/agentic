import React from 'react';
import { useFlowEditor } from '../FlowEditorProvider';
import type { Step } from '../lib/types';
import { TextStepForm } from './TextStepForm';
import { MediaStepForm } from './MediaStepForm';
import { ToolStepForm } from './ToolStepForm';
import { TimeStepForm } from './TimeStepForm';

interface Props {
    stepId: string;
    onClose: () => void;
    compact?: boolean;
}

export function StepDetailPanel({ stepId, onClose, compact }: Props) {
    const { flow, updateStep, removeStep, moveStep } = useFlowEditor();

    const stepIndex = flow.steps.findIndex(s => (s.id || `temp-${s.tempId}`) === stepId);
    if (stepIndex === -1) return null;

    const step = flow.steps[stepIndex];
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === flow.steps.length - 1;

    const onChange = (updates: Partial<Step>) => {
        updateStep(stepIndex, { ...step, ...updates });
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-wa-border">
                <div className="flex items-center gap-2">
                    <span className="text-wa-green font-bold text-xs font-mono">
                        {step.type} #{step.order + 1}
                    </span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => moveStep(stepIndex, stepIndex - 1)}
                            disabled={isFirst}
                            title="Move up"
                            className={`bg-transparent border border-wa-border rounded px-2 py-1 text-xs leading-none cursor-pointer ${isFirst ? 'text-wa-border' : 'text-wa-text-secondary'}`}
                        >▲</button>
                        <button
                            onClick={() => moveStep(stepIndex, stepIndex + 1)}
                            disabled={isLast}
                            title="Move down"
                            className={`bg-transparent border border-wa-border rounded px-2 py-1 text-xs leading-none cursor-pointer ${isLast ? 'text-wa-border' : 'text-wa-text-secondary'}`}
                        >▼</button>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { removeStep(stepIndex); onClose(); }}
                        className="bg-transparent border-none text-red-400 cursor-pointer text-xs px-2 py-1">
                        Delete
                    </button>
                    {!compact && (
                        <button onClick={onClose}
                            className="bg-transparent border-none text-wa-text-secondary cursor-pointer text-sm px-2 py-1">
                            ×
                        </button>
                    )}
                </div>
            </div>

            {/* Common controls */}
            <div className="flex gap-2">
                <label className="flex-1">
                    <span className="fe-label">Delay (ms)</span>
                    <input type="number" value={step.delayMs} onChange={e => onChange({ delayMs: parseInt(e.target.value) || 1000 })}
                        className="fe-input" />
                </label>
                <label className="flex-1">
                    <span className="fe-label">Jitter ±%</span>
                    <input type="number" value={step.jitterPct} onChange={e => onChange({ jitterPct: parseInt(e.target.value) || 10 })}
                        className="fe-input" />
                </label>
            </div>

            <button
                onClick={() => onChange({ aiOnly: !step.aiOnly })}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border ${
                    step.aiOnly
                        ? 'border-purple-500/25 bg-purple-500/10 text-purple-400'
                        : 'border-wa-border bg-wa-bg-hover text-wa-text-secondary'
                }`}
            >
                AI Only
            </button>

            <div className="border-t border-wa-border pt-3">
                {step.type === 'TEXT' && <TextStepForm step={step} onChange={onChange} />}
                {['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT'].includes(step.type) && <MediaStepForm step={step} onChange={onChange} />}
                {step.type === 'TOOL' && <ToolStepForm step={step} onChange={onChange} />}
                {step.type === 'CONDITIONAL_TIME' && <TimeStepForm step={step} onChange={onChange} />}
            </div>
        </div>
    );
}

