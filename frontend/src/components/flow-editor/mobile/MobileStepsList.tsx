import React, { useState, useMemo } from 'react';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useFlowEditor } from '../FlowEditorProvider';
import { MobileStepCard } from './MobileStepCard';
import { StepEditModal } from './StepEditModal';
import type { Step } from '../lib/types';

export function MobileStepsList() {
    const { flow, moveStep, removeStep } = useFlowEditor();
    const [editingStep, setEditingStep] = useState<Step | null>(null);

    const steps = useMemo(
        () => [...flow.steps].sort((a, b) => a.order - b.order),
        [flow.steps],
    );

    const sortableIds = useMemo(
        () => steps.map(s => s.id || `temp-${s.tempId}`),
        [steps],
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = sortableIds.indexOf(String(active.id));
        const newIndex = sortableIds.indexOf(String(over.id));
        if (oldIndex !== -1 && newIndex !== -1) {
            moveStep(oldIndex, newIndex);
        }
    };

    const handleDelete = (stepIndex: number) => {
        removeStep(stepIndex);
    };

    if (steps.length === 0) {
        return (
            <div className="flex items-center justify-center py-16 text-wa-text-secondary text-sm">
                No steps yet. Add one below.
            </div>
        );
    }

    return (
        <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2 p-3">
                        {steps.map((step, idx) => {
                            const stepId = step.id || `temp-${step.tempId}`;
                            return (
                                <MobileStepCard
                                    key={stepId}
                                    step={step}
                                    stepIndex={idx}
                                    sortableId={stepId}
                                    onEdit={() => setEditingStep(step)}
                                    onDelete={() => handleDelete(idx)}
                                />
                            );
                        })}
                    </div>
                </SortableContext>
            </DndContext>

            {editingStep && (
                <StepEditModal
                    step={editingStep}
                    onClose={() => setEditingStep(null)}
                />
            )}
        </>
    );
}
