import React from 'react';
import { useFlowEditor } from '../FlowEditorProvider';
import type { Trigger } from '../lib/types';

export function TriggerPanel() {
    const { flow, updateTriggers, botLabels, templateId, templateVarDefs } = useFlowEditor();
    const triggers = flow.triggers;

    const labelColors = ['#00a884','#53bdeb','#009de2','#ff9a00','#d13b3b','#a552a1','#5bc5d1','#fc7e7e','#e8b830','#e354c5','#00d0b6','#349ded','#8c68e0','#e56e56','#a0d669','#62c5e1','#7e90e5','#e89844','#e873b0','#6ccb78'];

    const addTrigger = (type: 'TEXT' | 'LABEL') => {
        updateTriggers([...triggers, {
            keyword: '', matchType: 'CONTAINS',
            scope: type === 'TEXT' ? 'INCOMING' : 'BOTH',
            triggerType: type, labelName: '', labelAction: 'ADD',
        }]);
    };

    const updateTrigger = (index: number, updates: Partial<Trigger>) => {
        const updated = [...triggers];
        updated[index] = { ...updated[index], ...updates };
        updateTriggers(updated);
    };

    const removeTrigger = (index: number) => {
        updateTriggers(triggers.filter((_, i) => i !== index));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => addTrigger('TEXT')} style={addBtnStyle('#00a884')}>+ Text</button>
                <button onClick={() => addTrigger('LABEL')} style={addBtnStyle('#a552a1')}>+ Label</button>
            </div>

            {triggers.map((trigger, index) => (
                <div key={index} style={{
                    background: '#0b141a', border: `1px solid ${trigger.triggerType === 'LABEL' ? '#a552a130' : '#2a3942'}`,
                    borderRadius: 8, padding: 10,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{
                            fontSize: 8, padding: '2px 6px', borderRadius: 4,
                            color: trigger.triggerType === 'LABEL' ? '#a552a1' : '#00a884',
                            background: trigger.triggerType === 'LABEL' ? '#a552a115' : '#00a88415',
                        }}>
                            {trigger.triggerType || 'TEXT'}
                        </span>
                        <button onClick={() => removeTrigger(index)}
                            style={{ color: '#d13b3b50', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>×</button>
                    </div>

                    {(!trigger.triggerType || trigger.triggerType === 'TEXT') && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <select value={trigger.scope || 'INCOMING'} onChange={e => updateTrigger(index, { scope: e.target.value })} style={{ ...selectStyle, flex: 1 }}>
                                    <option value="INCOMING">INCOMING</option>
                                    <option value="OUTGOING">OUTGOING</option>
                                    <option value="BOTH">ALL</option>
                                </select>
                                <select value={trigger.matchType} onChange={e => updateTrigger(index, { matchType: e.target.value })} style={{ ...selectStyle, flex: 1 }}>
                                    <option value="CONTAINS">CONTAINS</option>
                                    <option value="EXACT">EXACT</option>
                                    <option value="REGEX">REGEX</option>
                                </select>
                            </div>
                            <input type="text" value={trigger.keyword} onChange={e => updateTrigger(index, { keyword: e.target.value })}
                                style={inputStyle} placeholder="Keyword or regex..." />
                        </div>
                    )}

                    {trigger.triggerType === 'LABEL' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <select value={trigger.labelAction || 'ADD'} onChange={e => updateTrigger(index, { labelAction: e.target.value as any })} style={selectStyle}>
                                <option value="ADD">When assigned</option>
                                <option value="REMOVE">When removed</option>
                            </select>
                            {templateId ? (
                                <select value={trigger.labelName || ''} onChange={e => updateTrigger(index, { labelName: e.target.value })} style={selectStyle}>
                                    <option value="">Select variable...</option>
                                    {templateVarDefs.filter(d => d.type === 'label').map(v => (
                                        <option key={v.name} value={`{{${v.name}}}`}>{v.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {botLabels.map(lbl => (
                                        <button key={lbl.id} onClick={() => updateTrigger(index, { labelName: trigger.labelName === lbl.name ? '' : lbl.name })}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                                                borderRadius: 6, fontSize: 10, cursor: 'pointer',
                                                border: trigger.labelName === lbl.name ? '1px solid #a552a160' : '1px solid #2a3942',
                                                background: trigger.labelName === lbl.name ? '#a552a115' : '#202c33',
                                                color: trigger.labelName === lbl.name ? '#a552a1' : '#8696a0',
                                            }}>
                                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: labelColors[lbl.color % labelColors.length] }} />
                                            {lbl.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}

            {triggers.length === 0 && (
                <div style={{ color: '#8696a0', fontSize: 10, textAlign: 'center', padding: 16 }}>No triggers</div>
            )}
        </div>
    );
}

const addBtnStyle = (color: string): React.CSSProperties => ({
    padding: '4px 10px', fontSize: 10, fontFamily: 'ui-monospace, monospace',
    color, background: `${color}20`, border: `1px solid ${color}30`,
    borderRadius: 6, cursor: 'pointer',
});
const inputStyle: React.CSSProperties = {
    width: '100%', background: '#202c33', border: '1px solid #2a3942', color: '#e9edef',
    padding: '6px 8px', borderRadius: 8, fontSize: 10, fontFamily: 'ui-monospace, monospace', outline: 'none',
};
const selectStyle: React.CSSProperties = {
    background: '#202c33', border: '1px solid #2a3942', color: '#e9edef',
    padding: '6px 8px', borderRadius: 8, fontSize: 10, fontFamily: 'ui-monospace, monospace', outline: 'none',
};
