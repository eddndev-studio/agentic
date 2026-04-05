import React, { useRef, useState, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StepCardPreview } from './StepCardPreview';
import type { Step } from '../lib/types';

interface Props {
    step: Step;
    stepIndex: number;
    onEdit: () => void;
    onDelete: () => void;
    sortableId: string;
}

const SWIPE_THRESHOLD = 60;
const SWIPE_OPEN = 130;

export function MobileStepCard({ step, stepIndex, onEdit, onDelete, sortableId }: Props) {
    const [swipeX, setSwipeX] = useState(0);
    const [swiping, setSwiping] = useState(false);
    const touchStart = useRef<{ x: number; y: number } | null>(null);
    const locked = useRef(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: sortableId,
        activationConstraint: { delay: 300, tolerance: 5 },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 'auto' as any,
    };

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
        locked.current = false;
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!touchStart.current) return;
        const touch = e.touches[0];
        const dx = touch.clientX - touchStart.current.x;
        const dy = touch.clientY - touchStart.current.y;

        if (!locked.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            locked.current = true;
            if (Math.abs(dy) > Math.abs(dx)) {
                touchStart.current = null;
                return;
            }
            setSwiping(true);
        }

        if (swiping || (locked.current && Math.abs(dx) > Math.abs(dy))) {
            const clampedX = Math.min(0, Math.max(-SWIPE_OPEN, dx));
            setSwipeX(clampedX);
        }
    }, [swiping]);

    const handleTouchEnd = useCallback(() => {
        if (swipeX < -SWIPE_THRESHOLD) {
            setSwipeX(-SWIPE_OPEN);
        } else {
            setSwipeX(0);
        }
        setSwiping(false);
        touchStart.current = null;
        locked.current = false;
    }, [swipeX]);

    const closeSwipe = () => setSwipeX(0);
    const isOpen = swipeX < -10;

    return (
        <div ref={setNodeRef} style={style} {...attributes} className="relative">
            {/* Background action layer — sits behind the card, fully rounded */}
            <div className="absolute inset-y-0 right-0 w-[140px] flex items-stretch rounded-lg overflow-hidden">
                <button
                    onClick={() => { closeSwipe(); onEdit(); }}
                    className="flex-1 flex items-center justify-center bg-blue-500 text-white transition-colors active:bg-blue-600"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </button>
                <button
                    onClick={() => { closeSwipe(); onDelete(); }}
                    className="flex-1 flex items-center justify-center bg-red-500 text-white transition-colors active:bg-red-600"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>

            {/* Foreground card — slides left to reveal background layer */}
            <div
                className={`relative bg-wa-bg-panel border border-wa-border rounded-lg flex items-center min-h-[56px] z-10 ${swiping ? '' : 'transition-transform duration-200 ease-out'}`}
                style={{ transform: `translateX(${swipeX}px)` }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Drag handle */}
                <div
                    className="flex items-center justify-center w-8 flex-shrink-0 text-wa-text-secondary/40 touch-none cursor-grab active:cursor-grabbing"
                    {...listeners}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                    </svg>
                </div>

                {/* Card content — tap to edit */}
                <button
                    onClick={() => { if (isOpen) { closeSwipe(); return; } onEdit(); }}
                    className="flex-1 flex items-center gap-3 py-3 pr-3 text-left bg-transparent border-none cursor-pointer min-w-0"
                >
                    <StepCardPreview step={step} />
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-wa-text-secondary font-mono">{step.delayMs}ms</span>
                        {step.aiOnly && (
                            <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ color: '#a552a1', background: '#a552a115' }}>AI</span>
                        )}
                    </div>
                </button>
            </div>
        </div>
    );
}
