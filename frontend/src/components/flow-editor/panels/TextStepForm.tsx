import React from 'react';
import type { Step } from '../lib/types';

interface Props {
    step: Step;
    onChange: (updates: Partial<Step>) => void;
}

export function TextStepForm({ step, onChange }: Props) {
    return (
        <div>
            <label>
                <span style={{ color: '#8696a0', fontSize: 9, display: 'block', marginBottom: 4 }}>Message content</span>
                <textarea
                    value={step.content || ''}
                    onChange={e => onChange({ content: e.target.value })}
                    rows={6}
                    style={{
                        width: '100%', background: '#202c33', border: '1px solid #2a3942',
                        color: '#e9edef', padding: '8px', borderRadius: 8, fontSize: 11,
                        fontFamily: 'ui-monospace, monospace', outline: 'none', resize: 'vertical',
                    }}
                    placeholder="Enter message content..."
                />
            </label>
        </div>
    );
}
