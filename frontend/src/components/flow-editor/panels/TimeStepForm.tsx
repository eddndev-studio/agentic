import React from 'react';
import type { Step } from '../lib/types';

interface Props {
    step: Step;
    onChange: (updates: Partial<Step>) => void;
}

export function TimeStepForm({ step, onChange }: Props) {
    const metadata = step.metadata || { branches: [], fallback: { type: 'TEXT', content: '' } };
    const branches = metadata.branches || [];
    const fallback = metadata.fallback || { type: 'TEXT', content: '' };

    const setMeta = (updates: any) => {
        onChange({ metadata: { ...metadata, ...updates } });
    };

    const updateBranch = (index: number, updates: any) => {
        const newBranches = [...branches];
        newBranches[index] = { ...newBranches[index], ...updates };
        setMeta({ branches: newBranches });
    };

    const addBranch = () => {
        setMeta({ branches: [...branches, { startTime: '09:00', endTime: '18:00', type: 'TEXT', content: '' }] });
    };

    const removeBranch = (index: number) => {
        setMeta({ branches: branches.filter((_: any, i: number) => i !== index) });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ color: '#8696a0', fontSize: 9 }}>Time-based conditional branches</span>

            {branches.map((branch: any, i: number) => (
                <div key={i} style={{
                    background: '#0b141a', border: '1px solid #2a3942', borderRadius: 8, padding: 10,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <input type="time" value={branch.startTime || '09:00'}
                            onChange={e => updateBranch(i, { startTime: e.target.value })}
                            style={timeInputStyle} />
                        <span style={{ color: '#8696a0' }}>-</span>
                        <input type="time" value={branch.endTime || '18:00'}
                            onChange={e => updateBranch(i, { endTime: e.target.value })}
                            style={timeInputStyle} />
                        <button onClick={() => removeBranch(i)}
                            style={{ marginLeft: 'auto', color: '#d13b3b50', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                            ×
                        </button>
                    </div>
                    <select value={branch.type || 'TEXT'} onChange={e => updateBranch(i, { type: e.target.value })}
                        style={{ ...selectStyle, marginBottom: 6 }}>
                        <option value="TEXT">TEXT</option>
                        <option value="IMAGE">IMAGE</option>
                        <option value="VIDEO">VIDEO</option>
                        <option value="AUDIO">AUDIO</option>
                    </select>
                    <textarea value={branch.content || ''} onChange={e => updateBranch(i, { content: e.target.value })}
                        rows={2} style={textareaStyle} placeholder="Branch content..." />
                    {branch.type !== 'TEXT' && (
                        <input type="text" value={branch.mediaUrl || ''} onChange={e => updateBranch(i, { mediaUrl: e.target.value })}
                            style={{ ...inputStyle, marginTop: 4 }} placeholder="https://... o {{VARIABLE}}" />
                    )}
                </div>
            ))}

            <button onClick={addBranch} style={{
                padding: '8px', border: '1px dashed #2a3942', borderRadius: 8,
                color: '#8696a0', background: 'none', cursor: 'pointer', fontSize: 10,
            }}>
                + Add time range
            </button>

            {/* Fallback */}
            <div style={{ borderTop: '1px solid #2a3942', paddingTop: 10 }}>
                <span style={{ color: '#8696a0', fontSize: 9, display: 'block', marginBottom: 6 }}>Fallback (no match)</span>
                <select value={fallback.type || 'TEXT'} onChange={e => setMeta({ fallback: { ...fallback, type: e.target.value } })}
                    style={{ ...selectStyle, marginBottom: 6 }}>
                    <option value="TEXT">TEXT</option>
                    <option value="IMAGE">IMAGE</option>
                    <option value="VIDEO">VIDEO</option>
                    <option value="AUDIO">AUDIO</option>
                </select>
                <textarea value={fallback.content || ''} onChange={e => setMeta({ fallback: { ...fallback, content: e.target.value } })}
                    rows={2} style={textareaStyle} placeholder="Fallback content..." />
                {fallback.type && fallback.type !== 'TEXT' && (
                    <input type="text" value={fallback.mediaUrl || ''} onChange={e => setMeta({ fallback: { ...fallback, mediaUrl: e.target.value } })}
                        style={{ ...inputStyle, marginTop: 4 }} placeholder="https://... o {{VARIABLE}}" />
                )}
            </div>
        </div>
    );
}

const timeInputStyle: React.CSSProperties = {
    background: '#202c33', border: '1px solid #2a3942', color: '#e8b830',
    padding: '4px 6px', borderRadius: 6, fontSize: 10, fontFamily: 'ui-monospace, monospace', outline: 'none',
};
const inputStyle: React.CSSProperties = {
    width: '100%', background: '#202c33', border: '1px solid #2a3942', color: '#e9edef',
    padding: '6px 8px', borderRadius: 8, fontSize: 10, fontFamily: 'ui-monospace, monospace', outline: 'none',
};
const selectStyle: React.CSSProperties = {
    width: '100%', background: '#202c33', border: '1px solid #2a3942', color: '#e9edef',
    padding: '6px 8px', borderRadius: 8, fontSize: 10, fontFamily: 'ui-monospace, monospace', outline: 'none',
};
const textareaStyle: React.CSSProperties = {
    width: '100%', background: '#202c33', border: '1px solid #2a3942', color: '#e9edef',
    padding: '8px', borderRadius: 8, fontSize: 10, fontFamily: 'ui-monospace, monospace',
    outline: 'none', resize: 'vertical',
};
