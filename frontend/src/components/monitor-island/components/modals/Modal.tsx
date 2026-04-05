import React, { useEffect } from 'react';

interface Props {
    show: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export function Modal({ show, onClose, children }: Props) {
    useEffect(() => {
        if (!show) return;
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [show, onClose]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4" onClick={onClose}>
            <div
                className="bg-wa-bg-panel border border-wa-border w-full sm:max-w-md sm:rounded-xl p-5 sm:p-6"
                onClick={e => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}
