import React, { useEffect } from 'react';
import { StepDetailPanel } from '../panels/StepDetailPanel';
import { typeConfig } from './StepCardPreview';
import type { Step } from '../lib/types';

interface Props {
    step: Step;
    onClose: () => void;
}

export function StepEditModal({ step, onClose }: Props) {
    const stepId = step.id || `temp-${step.tempId}`;
    const config = typeConfig[step.type] || typeConfig.TEXT;

    // Lock body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-wa-bg-deep" onClick={onClose}>
            {/* Header */}
            <div
                className="flex items-center gap-3 px-4 py-3 bg-wa-bg-header border-b border-wa-border flex-shrink-0"
                onClick={e => e.stopPropagation()}
            >
                <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-wa-text-secondary">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded" style={{ color: config.color, background: config.bg }}>
                    {step.type}
                </span>
                <span className="text-sm font-semibold text-wa-text-primary">Step #{step.order + 1}</span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
                <StepDetailPanel stepId={stepId} onClose={onClose} compact />
            </div>
        </div>
    );
}
