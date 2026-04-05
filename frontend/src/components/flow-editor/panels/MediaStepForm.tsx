import React from 'react';
import type { Step } from '../lib/types';
import { useFlowEditor } from '../FlowEditorProvider';
import type { VarDef } from '../hooks/useFlowState';

interface Props {
    step: Step;
    onChange: (updates: Partial<Step>) => void;
}

const isVariableRef = (value: string | undefined | null): boolean =>
    !!value && /^\{\{\w+\}\}$/.test(value.trim());

const MEDIA_TYPES = ['image', 'video', 'audio', 'document'];

const mediaTypeColors: Record<string, string> = {
    image: '#53bdeb',
    video: '#ff9a00',
    audio: '#5bc5d1',
    document: '#e8b830',
};

export function MediaStepForm({ step, onChange }: Props) {
    const { varDefs } = useFlowEditor();
    const mediaVars = varDefs.filter(v => MEDIA_TYPES.includes(v.type));
    const openMediaPicker = () => {
        window.dispatchEvent(new CustomEvent('open-media-picker', {
            detail: {
                callback: (url: string) => onChange({ mediaUrl: url }),
            },
        }));
    };

    const mediaUrlIsVariable = isVariableRef(step.mediaUrl);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label>
                <span className="fe-label">Media URL</span>
                <div style={{ display: 'flex', gap: 4 }}>
                    <input
                        type="text"
                        value={step.mediaUrl || ''}
                        onChange={e => onChange({ mediaUrl: e.target.value })}
                        className="fe-input"
                        style={{ flex: 1, width: 'auto' }}
                        placeholder="https://... o {{VARIABLE}}"
                    />
                    <button onClick={openMediaPicker} style={{
                        background: '#202c33', border: '1px solid #2a3942', color: '#8696a0',
                        padding: '6px 10px', borderRadius: 8, fontSize: 10, cursor: 'pointer',
                    }}>
                        Pick
                    </button>
                </div>
                {mediaUrlIsVariable && (
                    <span style={{
                        display: 'inline-block', marginTop: 4, padding: '2px 6px',
                        background: '#7f66ff20', color: '#a78bfa', borderRadius: 4,
                        fontSize: 9, fontFamily: 'ui-monospace, monospace',
                    }}>
                        Variable: {step.mediaUrl!.replace(/[{}]/g, '')}
                    </span>
                )}
            </label>

            {/* Available media variables */}
            {mediaVars.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ color: '#8696a0', fontSize: 9 }}>Variables multimedia disponibles:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {mediaVars.map(v => (
                            <button
                                key={v.name}
                                type="button"
                                onClick={() => onChange({ mediaUrl: `{{${v.name}}}` })}
                                style={{
                                    padding: '2px 8px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
                                    fontFamily: 'ui-monospace, monospace', border: 'none',
                                    background: (mediaTypeColors[v.type] || '#7f66ff') + '20',
                                    color: mediaTypeColors[v.type] || '#a78bfa',
                                }}
                                title={`Insertar {{${v.name}}} (${v.type})`}
                            >
                                {'{{' + v.name + '}}'}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Hint when no variables and no URL set */}
            {mediaVars.length === 0 && !step.mediaUrl && (
                <span style={{ color: '#8696a040', fontSize: 9, fontStyle: 'italic' }}>
                    Usa {'{{VARIABLE}}'} para referenciar una variable multimedia del bot
                </span>
            )}

            {step.type === 'IMAGE' && step.mediaUrl && !mediaUrlIsVariable && (
                <img src={step.mediaUrl} alt="" style={{
                    height: 80, objectFit: 'cover', borderRadius: 8, opacity: 0.7,
                    border: '1px solid #2a3942',
                }} />
            )}

            {(step.type === 'IMAGE' || step.type === 'VIDEO') && (
                <label>
                    <span className="fe-label">Caption</span>
                    <textarea
                        value={step.content || ''}
                        onChange={e => onChange({ content: e.target.value })}
                        rows={2}
                        className="fe-textarea"
                        placeholder="Caption (optional)"
                    />
                </label>
            )}
        </div>
    );
}
