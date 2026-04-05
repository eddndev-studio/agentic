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

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-wa-bg-deep">
            {/* Header — matches SectionHeader pattern */}
            <header className="border-b border-wa-border px-4 pb-4 pt-3 space-y-2 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="text-wa-text-secondary hover:text-wa-green transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md border"
                        style={{ color: config.color, background: config.bg, borderColor: `${config.color}30` }}
                    >
                        {step.type}
                    </span>
                </div>
                <h2 className="text-lg font-bold text-wa-text-primary">
                    Paso #{step.order + 1}
                </h2>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                <StepDetailPanel stepId={stepId} onClose={onClose} compact />
            </div>
        </div>
    );
}
