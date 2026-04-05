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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingBottom: 10, borderBottom: '1px solid #2a3942',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#00a884', fontWeight: 700, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
                        {step.type} #{step.order + 1}
                    </span>
                    <div style={{ display: 'flex', gap: 2 }}>
                        <button
                            onClick={() => moveStep(stepIndex, stepIndex - 1)}
                            disabled={isFirst}
                            title="Move up"
                            style={{
                                background: 'none', border: '1px solid #2a3942', borderRadius: 4,
                                color: isFirst ? '#2a3942' : '#8696a0', cursor: isFirst ? 'default' : 'pointer',
                                fontSize: 11, padding: '1px 5px', lineHeight: 1,
                            }}
                        >▲</button>
                        <button
                            onClick={() => moveStep(stepIndex, stepIndex + 1)}
                            disabled={isLast}
                            title="Move down"
                            style={{
                                background: 'none', border: '1px solid #2a3942', borderRadius: 4,
                                color: isLast ? '#2a3942' : '#8696a0', cursor: isLast ? 'default' : 'pointer',
                                fontSize: 11, padding: '1px 5px', lineHeight: 1,
                            }}
                        >▼</button>
                    </div>
                </div>
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
                    <span className="fe-label">Delay (ms)</span>
                    <input type="number" value={step.delayMs} onChange={e => onChange({ delayMs: parseInt(e.target.value) || 1000 })}
                        className="fe-input" />
                </label>
                <label style={{ flex: 1 }}>
                    <span className="fe-label">Jitter ±%</span>
                    <input type="number" value={step.jitterPct} onChange={e => onChange({ jitterPct: parseInt(e.target.value) || 10 })}
                        className="fe-input" />
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

