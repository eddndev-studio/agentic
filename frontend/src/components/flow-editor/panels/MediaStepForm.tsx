import React from 'react';
import type { Step } from '../lib/types';

interface Props {
    step: Step;
    onChange: (updates: Partial<Step>) => void;
}

const isVariableRef = (value: string | undefined | null): boolean =>
    !!value && /^\{\{\w+\}\}$/.test(value.trim());

export function MediaStepForm({ step, onChange }: Props) {
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
                <span style={{ color: '#8696a0', fontSize: 9, display: 'block', marginBottom: 4 }}>Media URL</span>
                <div style={{ display: 'flex', gap: 4 }}>
                    <input
                        type="text"
                        value={step.mediaUrl || ''}
                        onChange={e => onChange({ mediaUrl: e.target.value })}
                        style={{
                            flex: 1, background: '#202c33', border: '1px solid #2a3942',
                            color: '#e9edef', padding: '6px 8px', borderRadius: 8, fontSize: 10,
                            fontFamily: 'ui-monospace, monospace', outline: 'none',
                        }}
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

            {step.type === 'IMAGE' && step.mediaUrl && !mediaUrlIsVariable && (
                <img src={step.mediaUrl} alt="" style={{
                    height: 80, objectFit: 'cover', borderRadius: 8, opacity: 0.7,
                    border: '1px solid #2a3942',
                }} />
            )}

            {(step.type === 'IMAGE' || step.type === 'VIDEO') && (
                <label>
                    <span style={{ color: '#8696a0', fontSize: 9, display: 'block', marginBottom: 4 }}>Caption</span>
                    <textarea
                        value={step.content || ''}
                        onChange={e => onChange({ content: e.target.value })}
                        rows={2}
                        style={{
                            width: '100%', background: '#202c33', border: '1px solid #2a3942',
                            color: '#e9edef', padding: '8px', borderRadius: 8, fontSize: 11,
                            fontFamily: 'ui-monospace, monospace', outline: 'none', resize: 'vertical',
                        }}
                        placeholder="Caption (optional)"
                    />
                </label>
            )}
        </div>
    );
}
