import React from 'react';
import type { Step } from '../lib/types';

const typeConfig: Record<string, { label: string; color: string; bg: string }> = {
    TEXT: { label: 'TEXT', color: '#00a884', bg: '#00a88420' },
    IMAGE: { label: 'IMAGE', color: '#53bdeb', bg: '#53bdeb20' },
    AUDIO: { label: 'AUDIO', color: '#5bc5d1', bg: '#5bc5d120' },
    VIDEO: { label: 'VIDEO', color: '#ff9a00', bg: '#ff9a0020' },
    DOCUMENT: { label: 'DOC', color: '#e8b830', bg: '#e8b83020' },
    CONDITIONAL_TIME: { label: 'TIME', color: '#e8b830', bg: '#e8b83020' },
    TOOL: { label: 'TOOL', color: '#a552a1', bg: '#a552a120' },
};

function getPreviewText(step: Step): string {
    switch (step.type) {
        case 'TEXT':
            return step.content?.substring(0, 60) || 'Empty message';
        case 'IMAGE':
        case 'VIDEO':
        case 'AUDIO':
        case 'DOCUMENT': {
            const url = step.mediaUrl || '';
            const name = url.includes('{{') ? url : url.split('/').pop() || '';
            const caption = step.content ? ` — ${step.content.substring(0, 30)}` : '';
            return (name || 'No media') + caption;
        }
        case 'TOOL':
            return step.metadata?.toolName || 'No tool selected';
        case 'CONDITIONAL_TIME': {
            const branches = step.metadata?.branches?.length ?? 0;
            return `${branches} branch${branches !== 1 ? 'es' : ''} + fallback`;
        }
        default:
            return step.content?.substring(0, 60) || step.type;
    }
}

interface Props {
    step: Step;
}

export function StepCardPreview({ step }: Props) {
    const config = typeConfig[step.type] || typeConfig.TEXT;
    const preview = getPreviewText(step);

    return (
        <div className="flex items-center gap-2.5 min-w-0">
            <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0"
                style={{ color: config.color, background: config.bg, borderColor: `${config.color}30` }}
            >
                {config.label}
            </span>
            <span className="text-xs text-wa-text-secondary truncate">
                #{step.order + 1}
            </span>
            <span className="text-xs text-wa-text-primary truncate flex-1 min-w-0">
                {preview}
            </span>
        </div>
    );
}

export { typeConfig };
