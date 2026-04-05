import React from 'react';
import { useFlowEditor } from '../FlowEditorProvider';
import { MobileStepCard } from './MobileStepCard';

interface Props {
    expandedStepId: string | null;
    onToggleExpand: (stepId: string) => void;
}

export function MobileStepsList({ expandedStepId, onToggleExpand }: Props) {
    const { flow } = useFlowEditor();
    const steps = [...flow.steps].sort((a, b) => a.order - b.order);

    if (steps.length === 0) {
        return (
            <div className="flex items-center justify-center py-16 text-wa-text-secondary text-sm">
                No steps yet. Add one below.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 p-3">
            {steps.map((step, idx) => {
                const stepId = step.id || `temp-${step.tempId}`;
                return (
                    <MobileStepCard
                        key={stepId}
                        step={step}
                        stepIndex={idx}
                        isExpanded={expandedStepId === stepId}
                        onToggle={() => onToggleExpand(stepId)}
                    />
                );
            })}
        </div>
    );
}
