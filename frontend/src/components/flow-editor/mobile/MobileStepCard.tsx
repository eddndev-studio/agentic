import React, { useRef, useEffect } from 'react';
import { useFlowEditor } from '../FlowEditorProvider';
import { StepCardPreview, typeConfig } from './StepCardPreview';
import { StepDetailPanel } from '../panels/StepDetailPanel';
import type { Step } from '../lib/types';

interface Props {
    step: Step;
    stepIndex: number;
    isExpanded: boolean;
    onToggle: () => void;
}

export function MobileStepCard({ step, stepIndex, isExpanded, onToggle }: Props) {
    const cardRef = useRef<HTMLDivElement>(null);
    const config = typeConfig[step.type] || typeConfig.TEXT;
    const stepId = step.id || `temp-${step.tempId}`;

    // Auto-scroll into view when expanded
    useEffect(() => {
        if (isExpanded && cardRef.current) {
            setTimeout(() => {
                cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [isExpanded]);

    return (
        <div ref={cardRef} className="bg-wa-bg-panel border border-wa-border rounded-lg overflow-hidden transition-all">
            {/* Collapsed header — always visible */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 p-3 text-left cursor-pointer bg-transparent border-none min-h-[56px]"
            >
                <StepCardPreview step={step} />

                {/* Delay + chevron */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-wa-text-secondary font-mono">
                        {step.delayMs}ms
                    </span>
                    {step.aiOnly && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ color: '#a552a1', background: '#a552a115' }}>
                            AI
                        </span>
                    )}
                    <svg
                        className={`w-4 h-4 text-wa-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {/* Expanded body */}
            {isExpanded && (
                <div className="border-t border-wa-border p-3">
                    <StepDetailPanel stepId={stepId} onClose={onToggle} compact />
                </div>
            )}
        </div>
    );
}
