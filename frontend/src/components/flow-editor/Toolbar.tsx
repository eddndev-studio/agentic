import React from 'react';
import { useFlowEditor } from './FlowEditorProvider';
import { t } from '../../i18n/index';

const stepTypes = [
    { type: 'TEXT', label: 'Text', color: '#00a884', bg: '#00a88420' },
    { type: 'IMAGE', label: 'Image', color: '#53bdeb', bg: '#53bdeb20' },
    { type: 'AUDIO', label: 'Audio', color: '#5bc5d1', bg: '#5bc5d120' },
    { type: 'VIDEO', label: 'Video', color: '#ff9a00', bg: '#ff9a0020' },
    { type: 'CONDITIONAL_TIME', label: 'TIME', color: '#e8b830', bg: '#e8b83020' },
    { type: 'TOOL', label: 'TOOL', color: '#a552a1', bg: '#a552a120' },
];

export function Toolbar() {
    const { addStep } = useFlowEditor();

    return (
        <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 4, padding: '6px 10px',
            background: '#111b21', border: '1px solid #2a3942', borderRadius: 10,
            zIndex: 10,
        }}>
            {stepTypes.map(({ type, label, color, bg }) => (
                <button
                    key={type}
                    onClick={() => addStep(type)}
                    style={{
                        padding: '4px 10px', fontSize: 10, fontFamily: 'ui-monospace, monospace',
                        color, background: bg, border: `1px solid ${color}30`,
                        borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                        transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                    + {label}
                </button>
            ))}
        </div>
    );
}
