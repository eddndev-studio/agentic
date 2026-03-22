import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { TriggerNodeData } from '../lib/types';

const BoltIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

export function TriggerNode({ data, selected }: NodeProps) {
    const nodeData = data as unknown as TriggerNodeData;
    const triggers = nodeData.triggers || [];

    return (
        <div style={{
            width: 220,
            background: '#0b141a',
            border: `1.5px solid ${selected ? '#00a884' : '#00a88440'}`,
            borderRadius: 12,
            fontFamily: 'ui-monospace, monospace',
            fontSize: 11,
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 10px', background: '#00a88415',
                borderBottom: '1px solid #00a88430',
            }}>
                <span style={{ color: '#00a884' }}><BoltIcon /></span>
                <span style={{ color: '#00a884', fontWeight: 700, fontSize: 10 }}>TRIGGERS</span>
                <span style={{ marginLeft: 'auto', color: '#8696a0', fontSize: 9 }}>{triggers.length}</span>
            </div>

            {/* Trigger list */}
            <div style={{ padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {triggers.map((t, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: '#111b21', padding: '3px 6px', borderRadius: 4,
                    }}>
                        <span style={{
                            fontSize: 8, padding: '1px 4px', borderRadius: 3,
                            color: t.triggerType === 'LABEL' ? '#a552a1' : '#00a884',
                            background: t.triggerType === 'LABEL' ? '#a552a115' : '#00a88415',
                        }}>
                            {t.triggerType === 'LABEL' ? 'LBL' : 'TXT'}
                        </span>
                        <span style={{ color: '#e9edef', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.triggerType === 'LABEL' ? t.labelName || 'any' : t.keyword || '...'}
                        </span>
                    </div>
                ))}
                {triggers.length === 0 && (
                    <span style={{ color: '#8696a0', fontStyle: 'italic', fontSize: 10 }}>No triggers</span>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} style={{
                background: '#00a884', border: '2px solid #0b141a', width: 10, height: 10,
            }} />
        </div>
    );
}
