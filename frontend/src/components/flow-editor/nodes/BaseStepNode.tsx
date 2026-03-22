import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { StepNodeData } from '../lib/types';

interface Props {
    data: StepNodeData;
    selected?: boolean;
    typeLabel: string;
    typeColor: string;
    icon: React.ReactNode;
    children: React.ReactNode;
}

export function BaseStepNode({ data, selected, typeLabel, typeColor, icon, children }: Props) {
    const { step } = data;

    return (
        <div style={{
            width: 220,
            background: '#111b21',
            border: `1.5px solid ${selected ? '#00a884' : '#2a3942'}`,
            borderRadius: 12,
            fontFamily: 'ui-monospace, monospace',
            fontSize: 11,
            overflow: 'hidden',
            transition: 'border-color 0.15s',
            boxShadow: selected ? '0 0 0 1px #00a884' : 'none',
        }}>
            <Handle type="target" position={Position.Top} style={{
                background: '#2a3942', border: '2px solid #111b21', width: 10, height: 10,
            }} />

            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 10px', borderBottom: '1px solid #2a3942',
                background: '#0b141a',
            }}>
                <span style={{ color: typeColor, display: 'flex', alignItems: 'center' }}>{icon}</span>
                <span style={{ color: typeColor, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{typeLabel}</span>
                <span style={{ marginLeft: 'auto', color: '#8696a0', fontSize: 9 }}>#{step.order + 1}</span>
            </div>

            {/* Body */}
            <div style={{ padding: '8px 10px', minHeight: 32 }}>
                {children}
            </div>

            {/* Footer */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 10px 6px', borderTop: '1px solid #1a2730',
                fontSize: 9, color: '#8696a0',
            }}>
                <span>{step.delayMs}ms</span>
                {step.jitterPct > 0 && <span>±{step.jitterPct}%</span>}
                {step.aiOnly && (
                    <span style={{
                        marginLeft: 'auto', color: '#a552a1', background: '#a552a115',
                        padding: '1px 5px', borderRadius: 4, fontSize: 8,
                    }}>AI</span>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} style={{
                background: '#2a3942', border: '2px solid #111b21', width: 10, height: 10,
            }} />
        </div>
    );
}
