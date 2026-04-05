import React, { useMemo, useRef } from 'react';
import type { Step } from '../lib/types';
import { useFlowEditor } from '../FlowEditorProvider';

const URL_RE = /https?:\/\/[^\s]+/i;

interface Props {
    step: Step;
    onChange: (updates: Partial<Step>) => void;
}

export function TextStepForm({ step, onChange }: Props) {
    const { varDefs } = useFlowEditor();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const insertVariable = (varName: string) => {
        const el = textareaRef.current;
        const tag = `{{${varName}}}`;
        if (el) {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const text = step.content || '';
            const newText = text.substring(0, start) + tag + text.substring(end);
            onChange({ content: newText });
            // Restore cursor after the inserted variable
            requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = start + tag.length;
                el.focus();
            });
        } else {
            onChange({ content: (step.content || '') + tag });
        }
    };
    const hasLink = useMemo(() => URL_RE.test(step.content || ''), [step.content]);
    const linkPreview = step.metadata?.linkPreview !== false; // default true

    const toggleLinkPreview = () => {
        onChange({ metadata: { ...step.metadata, linkPreview: !linkPreview } });
    };

    return (
        <div>
            <label>
                <span className="fe-label">Message content</span>
                <textarea
                    ref={textareaRef}
                    value={step.content || ''}
                    onChange={e => onChange({ content: e.target.value })}
                    rows={6}
                    className="fe-textarea"
                    placeholder="Enter message content..."
                />
            </label>

            {varDefs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    <span className="fe-label" style={{ marginBottom: 0 }}>Insertar variable:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {varDefs.map(v => (
                            <button
                                key={v.name}
                                type="button"
                                onClick={() => insertVariable(v.name)}
                                style={{
                                    padding: '2px 8px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
                                    fontFamily: 'ui-monospace, monospace', border: 'none',
                                    background: v.type === 'text' ? '#7f66ff20' : '#53bdeb20',
                                    color: v.type === 'text' ? '#a78bfa' : '#53bdeb',
                                }}
                                title={`{{${v.name}}} (${v.type})`}
                            >
                                {v.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

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
