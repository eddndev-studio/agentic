import React, { useMemo, useRef, useCallback, useEffect } from 'react';
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

    // Auto-resize textarea to fit content
    const autoResize = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }, []);

    // Resize on content change and initial mount
    useEffect(() => { autoResize(); }, [step.content, autoResize]);

    const insertVariable = (varName: string) => {
        const el = textareaRef.current;
        const tag = `{{${varName}}}`;
        if (el) {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const text = step.content || '';
            const newText = text.substring(0, start) + tag + text.substring(end);
            onChange({ content: newText });
            requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = start + tag.length;
                el.focus();
                autoResize();
            });
        } else {
            onChange({ content: (step.content || '') + tag });
        }
    };

    const hasLink = useMemo(() => URL_RE.test(step.content || ''), [step.content]);
    const linkPreview = step.metadata?.linkPreview !== false;

    const toggleLinkPreview = () => {
        onChange({ metadata: { ...step.metadata, linkPreview: !linkPreview } });
    };

    return (
        <div>
            <label>
                <span className="fe-label">Contenido del mensaje</span>
                <textarea
                    ref={textareaRef}
                    value={step.content || ''}
                    onChange={e => { onChange({ content: e.target.value }); }}
                    className="fe-textarea !overflow-hidden"
                    style={{ resize: 'none', minHeight: 80 }}
                    placeholder="Escribe el contenido del mensaje..."
                />
            </label>

            {varDefs.length > 0 && (
                <div className="flex flex-col gap-1 mt-2">
                    <span className="fe-label">Insertar variable:</span>
                    <div className="flex flex-wrap gap-1.5">
                        {varDefs.map(v => (
                            <button
                                key={v.name}
                                type="button"
                                onClick={() => insertVariable(v.name)}
                                className="px-2.5 py-1 rounded-md text-xs cursor-pointer font-mono border-none"
                                style={{
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
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <div
                        onClick={toggleLinkPreview}
                        className="relative flex-shrink-0 transition-colors"
                        style={{
                            width: 36, height: 20, borderRadius: 10,
                            background: linkPreview ? '#00a884' : '#3b4a54',
                        }}
                    >
                        <div
                            className="absolute top-[3px] transition-[left]"
                            style={{
                                width: 14, height: 14, borderRadius: '50%',
                                background: '#e9edef',
                                left: linkPreview ? 19 : 3,
                            }}
                        />
                    </div>
                    <span className="text-wa-text-secondary text-xs">Previsualizar enlace (Open Graph)</span>
                </label>
            )}
        </div>
    );
}
