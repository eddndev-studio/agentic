import React from 'react';
import { useFlowEditor } from '../FlowEditorProvider';

const stepTypes = [
    { type: 'TEXT', label: 'Text', color: '#00a884', bg: '#00a88410' },
    { type: 'IMAGE', label: 'Image', color: '#53bdeb', bg: '#53bdeb10' },
    { type: 'AUDIO', label: 'Audio', color: '#5bc5d1', bg: '#5bc5d110' },
    { type: 'VIDEO', label: 'Video', color: '#ff9a00', bg: '#ff9a0010' },
    { type: 'CONDITIONAL_TIME', label: 'TIME', color: '#e8b830', bg: '#e8b83010' },
    { type: 'TOOL', label: 'TOOL', color: '#a552a1', bg: '#a552a110' },
];

export function MobileAddStepBar() {
    const { addStep } = useFlowEditor();

    return (
        <div className="bg-wa-bg-panel border-t border-wa-border px-3 py-2 flex gap-2 overflow-x-auto flex-shrink-0">
            {stepTypes.map(({ type, label, color, bg }) => (
                <button
                    key={type}
                    onClick={() => addStep(type)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-sans flex-shrink-0 border cursor-pointer active:scale-95 transition-all whitespace-nowrap"
                    style={{ color, background: bg, borderColor: `${color}20` }}
                >
                    + {label}
                </button>
            ))}
        </div>
    );
}
