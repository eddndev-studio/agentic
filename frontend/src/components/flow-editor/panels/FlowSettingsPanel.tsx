import React from 'react';
import { useFlowEditor } from '../FlowEditorProvider';

export function FlowSettingsPanel() {
    const { flow, setFlow, availableFlows } = useFlowEditor();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ flex: 1 }}>
                    <span style={labelStyle}>Usage limit</span>
                    <select value={flow.usageLimit} onChange={e => setFlow({ ...flow, usageLimit: parseInt(e.target.value) })} style={selectStyle}>
                        <option value="0">∞</option>
                        <option value="1">1x</option>
                        <option value="3">3x</option>
                        <option value="5">5x</option>
                        <option value="10">10x</option>
                    </select>
                </label>
                <label style={{ flex: 1 }}>
                    <span style={labelStyle}>Cooldown</span>
                    <select value={flow.cooldownMs} onChange={e => setFlow({ ...flow, cooldownMs: parseInt(e.target.value) })} style={selectStyle}>
                        <option value="0">-</option>
                        <option value="60000">1min</option>
                        <option value="300000">5min</option>
                        <option value="3600000">1h</option>
                        <option value="86400000">24h</option>
                    </select>
                </label>
            </div>

            {availableFlows.length > 0 && (
                <div>
                    <span style={labelStyle}>Mutually exclusive with:</span>
                    <div style={{
                        maxHeight: 120, overflowY: 'auto', background: '#0b141a',
                        border: '1px solid #2a3942', borderRadius: 8, padding: 8, marginTop: 4,
                    }}>
                        {availableFlows.map(f => (
                            <label key={f.id} style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px',
                                cursor: 'pointer', borderRadius: 4, fontSize: 10, color: '#e9edef',
                            }}>
                                <input type="checkbox" checked={flow.excludesFlows.includes(f.id)}
                                    onChange={e => {
                                        const excl = e.target.checked
                                            ? [...flow.excludesFlows, f.id]
                                            : flow.excludesFlows.filter(id => id !== f.id);
                                        setFlow({ ...flow, excludesFlows: excl });
                                    }}
                                    style={{ accentColor: '#00a884' }}
                                />
                                <span style={{ fontFamily: 'ui-monospace, monospace' }}>{f.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

const labelStyle: React.CSSProperties = { color: '#8696a0', fontSize: 9, display: 'block', marginBottom: 4 };
const selectStyle: React.CSSProperties = {
    width: '100%', background: '#202c33', border: '1px solid #2a3942', color: '#e9edef',
    padding: '6px 8px', borderRadius: 8, fontSize: 10, fontFamily: 'ui-monospace, monospace', outline: 'none',
};
