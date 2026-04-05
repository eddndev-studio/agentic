import React from 'react';

interface Props {
    visible: boolean;
    onClick: () => void;
}

export function ScrollToBottom({ visible, onClick }: Props) {
    if (!visible) return null;

    return (
        <div className="relative">
            <button
                onClick={onClick}
                className="absolute bottom-3 right-3 sm:right-6 z-10 w-10 h-10 rounded-full bg-wa-bg-header border border-wa-border shadow-lg flex items-center justify-center text-wa-text-secondary hover:text-wa-green transition-colors"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
            </button>
        </div>
    );
}
