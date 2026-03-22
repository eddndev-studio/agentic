import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseStepNode } from './BaseStepNode';
import type { StepNodeData } from '../lib/types';

const ClockIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);

export function ConditionalTimeNode({ data, selected }: NodeProps) {
    const nodeData = data as unknown as StepNodeData;
    const branches = nodeData.step.metadata?.branches || [];
    const hasFallback = !!nodeData.step.metadata?.fallback;

    return (
        <BaseStepNode data={nodeData} selected={selected} typeLabel="Time" typeColor="#e8b830" icon={<ClockIcon />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {branches.map((b: any, i: number) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: '#202c33', padding: '2px 6px', borderRadius: 4, fontSize: 9,
                    }}>
                        <span style={{ color: '#e8b830' }}>{b.startTime}</span>
                        <span style={{ color: '#8696a0' }}>-</span>
                        <span style={{ color: '#e8b830' }}>{b.endTime}</span>
                        <span style={{ color: '#8696a0', marginLeft: 'auto', textTransform: 'uppercase', fontSize: 8 }}>{b.type}</span>
                    </div>
                ))}
                {branches.length === 0 && (
                    <span style={{ color: '#8696a0', fontStyle: 'italic' }}>No branches</span>
                )}
                {hasFallback && (
                    <div style={{ color: '#8696a0', fontSize: 8, marginTop: 2 }}>+ fallback</div>
                )}
            </div>
        </BaseStepNode>
    );
}
