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
}

export function StepDetailPanel({ stepId, onClose }: Props) {
    const { flow, updateStep, removeStep } = useFlowEditor();

    const stepIndex = flow.steps.findIndex(s => (s.id || `temp-${s.tempId}`) === stepId);
    if (stepIndex === -1) return null;

    const step = flow.steps[stepIndex];

    const onChange = (updates: Partial<Step>) => {
        updateStep(stepIndex, { ...step, ...updates });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingBottom: 10, borderBottom: '1px solid #2a3942',
            }}>
                <span style={{ color: '#00a884', fontWeight: 700, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
                    {step.type} #{step.order + 1}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { removeStep(stepIndex); onClose(); }}
                        style={{ color: '#d13b3b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>
                        Delete
                    </button>
                    <button onClick={onClose}
                        style={{ color: '#8696a0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                        ×
                    </button>
                </div>
            </div>

            {/* Common controls */}
            <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ flex: 1 }}>
                    <span style={{ color: '#8696a0', fontSize: 9, display: 'block', marginBottom: 4 }}>Delay (ms)</span>
                    <input type="number" value={step.delayMs} onChange={e => onChange({ delayMs: parseInt(e.target.value) || 1000 })}
                        style={inputStyle} />
                </label>
                <label style={{ flex: 1 }}>
                    <span style={{ color: '#8696a0', fontSize: 9, display: 'block', marginBottom: 4 }}>Jitter ±%</span>
                    <input type="number" value={step.jitterPct} onChange={e => onChange({ jitterPct: parseInt(e.target.value) || 10 })}
                        style={inputStyle} />
                </label>
            </div>

            <button
                onClick={() => onChange({ aiOnly: !step.aiOnly })}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    border: step.aiOnly ? '1px solid #a552a140' : '1px solid #2a3942',
                    background: step.aiOnly ? '#a552a115' : '#202c33',
                    color: step.aiOnly ? '#a552a1' : '#8696a0',
                }}
            >
                AI Only
            </button>

            <div style={{ borderTop: '1px solid #2a3942', paddingTop: 12 }}>
                {step.type === 'TEXT' && <TextStepForm step={step} onChange={onChange} />}
                {['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT'].includes(step.type) && <MediaStepForm step={step} onChange={onChange} />}
                {step.type === 'TOOL' && <ToolStepForm step={step} onChange={onChange} />}
                {step.type === 'CONDITIONAL_TIME' && <TimeStepForm step={step} onChange={onChange} />}
            </div>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%', background: '#202c33', border: '1px solid #2a3942',
    color: '#e9edef', padding: '6px 8px', borderRadius: 8, fontSize: 11,
    fontFamily: 'ui-monospace, monospace', outline: 'none',
};
