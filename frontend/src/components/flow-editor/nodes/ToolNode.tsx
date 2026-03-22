import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseStepNode } from './BaseStepNode';
import type { StepNodeData } from '../lib/types';

const ToolIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

export function ToolNode({ data, selected }: NodeProps) {
    const nodeData = data as unknown as StepNodeData;
    const toolName = nodeData.step.metadata?.toolName || '';

    return (
        <BaseStepNode data={nodeData} selected={selected} typeLabel="Tool" typeColor="#a552a1" icon={<ToolIcon />}>
            {toolName ? (
                <div style={{
                    display: 'inline-block', background: '#a552a115', color: '#a552a1',
                    padding: '3px 8px', borderRadius: 6, fontSize: 10, fontFamily: 'ui-monospace, monospace',
                    border: '1px solid #a552a130',
                }}>
                    {toolName}
                </div>
            ) : (
                <span style={{ color: '#8696a0', fontStyle: 'italic' }}>No tool selected</span>
            )}
        </BaseStepNode>
    );
}
