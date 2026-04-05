import React from 'react';
import { useFlowEditor } from '../FlowEditorProvider';

const stepTypes = [
    { type: 'TEXT', label: 'Text', color: '#00a884', bg: '#00a88420' },
    { type: 'IMAGE', label: 'Image', color: '#53bdeb', bg: '#53bdeb20' },
    { type: 'AUDIO', label: 'Audio', color: '#5bc5d1', bg: '#5bc5d120' },
    { type: 'VIDEO', label: 'Video', color: '#ff9a00', bg: '#ff9a0020' },
    { type: 'CONDITIONAL_TIME', label: 'TIME', color: '#e8b830', bg: '#e8b83020' },
    { type: 'TOOL', label: 'TOOL', color: '#a552a1', bg: '#a552a120' },
];

export function MobileAddStepBar() {
    const { addStep } = useFlowEditor();

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-wa-bg-panel border-t border-wa-border px-3 py-2.5 flex gap-2 overflow-x-auto z-20"
             style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
        >
            {stepTypes.map(({ type, label, color, bg }) => (
                <button
                    key={type}
                    onClick={() => addStep(type)}
                    className="flex items-center gap-1 px-3 py-2.5 rounded-lg text-xs font-semibold font-mono flex-shrink-0 border cursor-pointer active:scale-95 transition-transform"
                    style={{ color, background: bg, borderColor: `${color}30` }}
                >
                    + {label}
                </button>
            ))}
        </div>
    );
}
