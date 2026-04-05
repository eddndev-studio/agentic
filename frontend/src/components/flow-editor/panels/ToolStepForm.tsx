import React from 'react';
import { useFlowEditor } from '../FlowEditorProvider';
import { getLabelColor } from '../../../lib/label-colors';
import type { Step } from '../lib/types';

const BUILTIN_TOOLS = [
    'toggle_session_ai', 'activate_session_ai', 'deactivate_session_ai',
    'clear_conversation', 'get_current_time', 'get_labels', 'assign_label',
    'remove_label', 'get_sessions_by_label', 'reply_to_message',
    'send_followup_message', 'set_notification_channel', 'notify',
];

const NO_CONFIG_TOOLS = [
    'toggle_session_ai', 'activate_session_ai', 'deactivate_session_ai',
    'clear_conversation', 'get_labels', 'set_notification_channel',
];

interface Props {
    step: Step;
    onChange: (updates: Partial<Step>) => void;
}

export function ToolStepForm({ step, onChange }: Props) {
    const { availableTools, botLabels, templateId, templateVarDefs } = useFlowEditor();
    const metadata = step.metadata || { toolName: '', toolArgs: {} };
    const toolName = metadata.toolName || '';
    const toolArgs = metadata.toolArgs || {};

    const setMeta = (updates: any) => {
        onChange({ metadata: { ...metadata, ...updates } });
    };

    const setArg = (key: string, value: any) => {
        setMeta({ toolArgs: { ...toolArgs, [key]: value } });
    };

    const isCustom = toolName && !BUILTIN_TOOLS.includes(toolName);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label>
                <span className="fe-label">Tool</span>
                <select
                    value={toolName}
                    onChange={e => setMeta({ toolName: e.target.value, toolArgs: {} })}
                    className="fe-select"
                >
                    <option value="">-- Select tool --</option>
                    <optgroup label="Built-in">
                        {BUILTIN_TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
                    </optgroup>
                    {availableTools.length > 0 && (
                        <optgroup label="Custom">
                            {availableTools.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                        </optgroup>
                    )}
                </select>
            </label>

            {NO_CONFIG_TOOLS.includes(toolName) && (
                <div style={{ color: '#8696a0', fontSize: 10, background: '#202c33', padding: '6px 10px', borderRadius: 8 }}>
                    No configuration required
                </div>
            )}

            {/* Label tools */}
            {(toolName === 'assign_label' || toolName === 'remove_label') && (
                <LabelPicker
                    value={toolArgs.label_name || ''}
                    onSelect={(name: string) => setArg('label_name', name)}
                    labels={botLabels}
                    templateId={templateId}
                    templateVarDefs={templateVarDefs}
                    color={toolName === 'assign_label' ? '#a552a1' : '#d13b3b'}
                />
            )}

            {toolName === 'get_sessions_by_label' && (
                <>
                    <LabelPicker
                        value={toolArgs.label_name || ''}
                        onSelect={(name: string) => setArg('label_name', name)}
                        labels={botLabels}
                        templateId={templateId}
                        templateVarDefs={templateVarDefs}
                        color="#a552a1"
                    />
                    <label>
                        <span className="fe-label">include_messages</span>
                        <input type="number" value={toolArgs.include_messages || ''} placeholder="5"
                            onChange={e => setArg('include_messages', parseInt(e.target.value) || undefined)}
                            className="fe-input" />
                    </label>
                </>
            )}

            {toolName === 'reply_to_message' && (
                <>
                    <label>
                        <span className="fe-label">message_id *</span>
                        <input type="text" value={toolArgs.message_id || ''} onChange={e => setArg('message_id', e.target.value)} className="fe-input" />
                    </label>
                    <label>
                        <span className="fe-label">text *</span>
                        <textarea value={toolArgs.text || ''} onChange={e => setArg('text', e.target.value)} rows={2} className="fe-textarea" />
                    </label>
                </>
            )}

            {toolName === 'send_followup_message' && (
                <>
                    <label>
                        <span className="fe-label">session_id *</span>
                        <input type="text" value={toolArgs.session_id || ''} onChange={e => setArg('session_id', e.target.value)} className="fe-input" />
                    </label>
                    <label>
                        <span className="fe-label">message *</span>
                        <textarea value={toolArgs.message || ''} onChange={e => setArg('message', e.target.value)} rows={2} className="fe-textarea" />
                    </label>
                </>
            )}

            {toolName === 'notify' && (
                <>
                    <label>
                        <span className="fe-label">message *</span>
                        <textarea value={toolArgs.message || ''} onChange={e => setArg('message', e.target.value)} rows={2} className="fe-textarea" />
                    </label>
                    <label>
                        <span className="fe-label">priority</span>
                        <select value={toolArgs.priority || 'normal'} onChange={e => setArg('priority', e.target.value)} className="fe-select">
                            <option value="normal">normal</option>
                            <option value="low">low</option>
                            <option value="high">high</option>
                        </select>
                    </label>
                </>
            )}

            {toolName === 'get_current_time' && (
                <label>
                    <span className="fe-label">timezone</span>
                    <input type="text" value={toolArgs.timezone || ''} placeholder="America/Mexico_City"
                        onChange={e => setArg('timezone', e.target.value)} className="fe-input" />
                </label>
            )}

            {/* Custom tools: JSON editor */}
            {isCustom && (
                <label>
                    <span className="fe-label">Arguments (JSON)</span>
                    <textarea
                        defaultValue={JSON.stringify(toolArgs, null, 2)}
                        onBlur={e => { try { setMeta({ toolArgs: JSON.parse(e.target.value) }); } catch {} }}
                        rows={4} className="fe-textarea"
                        placeholder='{ "key": "value" }'
                    />
                </label>
            )}
        </div>
    );
}

function LabelPicker({ value, onSelect, labels, templateId, templateVarDefs, color }: {
    value: string; onSelect: (name: string) => void;
    labels: { id: string; name: string; color: number }[];
    templateId: string | null;
    templateVarDefs: { name: string; type: string }[];
    color: string;
}) {
    if (templateId) {
        const labelVars = templateVarDefs.filter(d => d.type === 'label');
        return (
            <label>
                <span className="fe-label">Label</span>
                <select value={value} onChange={e => onSelect(e.target.value)} className="fe-select">
                    <option value="">Select variable...</option>
                    {labelVars.map(v => <option key={v.name} value={`{{${v.name}}}`}>{v.name}</option>)}
                </select>
            </label>
        );
    }

    return (
        <div>
            <span className="fe-label">Label</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {labels.map(lbl => (
                    <button key={lbl.id} onClick={() => onSelect(value === lbl.name ? '' : lbl.name)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                            borderRadius: 6, fontSize: 10, cursor: 'pointer',
                            border: value === lbl.name ? `1px solid ${color}60` : '1px solid #2a3942',
                            background: value === lbl.name ? `${color}15` : '#202c33',
                            color: value === lbl.name ? color : '#8696a0',
                        }}
                    >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: getLabelColor(lbl.color) }} />
                        {lbl.name}
                    </button>
                ))}
                {labels.length === 0 && <span style={{ color: '#8696a0', fontSize: 10 }}>No labels synced</span>}
            </div>
        </div>
    );
}

