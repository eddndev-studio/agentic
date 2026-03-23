import React, { useMemo } from 'react';
import type { Step } from '../lib/types';

const URL_RE = /https?:\/\/[^\s]+/i;

interface Props {
    step: Step;
    onChange: (updates: Partial<Step>) => void;
}

export function TextStepForm({ step, onChange }: Props) {
    const hasLink = useMemo(() => URL_RE.test(step.content || ''), [step.content]);
    const linkPreview = step.metadata?.linkPreview !== false; // default true

    const toggleLinkPreview = () => {
        onChange({ metadata: { ...step.metadata, linkPreview: !linkPreview } });
    };

    return (
        <div>
            <label>
                <span style={{ color: '#8696a0', fontSize: 9, display: 'block', marginBottom: 4 }}>Message content</span>
                <textarea
                    value={step.content || ''}
                    onChange={e => onChange({ content: e.target.value })}
                    rows={6}
                    style={{
                        width: '100%', background: '#202c33', border: '1px solid #2a3942',
                        color: '#e9edef', padding: '8px', borderRadius: 8, fontSize: 11,
                        fontFamily: 'ui-monospace, monospace', outline: 'none', resize: 'vertical',
                    }}
                    placeholder="Enter message content..."
                />
            </label>

            {hasLink && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                    <div
                        onClick={toggleLinkPreview}
                        style={{
                            width: 32, height: 18, borderRadius: 9,
                            background: linkPreview ? '#00a884' : '#3b4a54',
                            position: 'relative', transition: 'background 0.2s',
                            flexShrink: 0,
                        }}
                    >
                        <div style={{
                            width: 14, height: 14, borderRadius: '50%',
                            background: '#e9edef', position: 'absolute', top: 2,
                            left: linkPreview ? 16 : 2, transition: 'left 0.2s',
                        }} />
                    </div>
                    <span style={{ color: '#8696a0', fontSize: 10 }}>Previsualizar enlace (Open Graph)</span>
                </label>
            )}
        </div>
    );
}
