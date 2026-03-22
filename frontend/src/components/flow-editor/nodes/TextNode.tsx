import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseStepNode } from './BaseStepNode';
import type { StepNodeData } from '../lib/types';

const TextIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
);

export function TextNode({ data, selected }: NodeProps) {
    const nodeData = data as unknown as StepNodeData;
    const content = nodeData.step.content || '';
    const preview = content.length > 60 ? content.slice(0, 60) + '...' : content;

    return (
        <BaseStepNode data={nodeData} selected={selected} typeLabel="Text" typeColor="#00a884" icon={<TextIcon />}>
            <div style={{ color: '#e9edef', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>
                {preview || <span style={{ color: '#8696a0', fontStyle: 'italic' }}>Empty message</span>}
            </div>
        </BaseStepNode>
    );
}
