import React from 'react';
import { useMonitor } from '../MonitorProvider';

const QUICK_REPLIES = [
    'Hola, gracias por tu mensaje. En un momento te atiendo.',
    'Gracias por tu compra, en breve te envio los detalles.',
    'Claro, dejame verificar y te confirmo.',
    'Listo, tu pedido ha sido procesado.',
    'Disculpa la demora, estamos trabajando en ello.',
];

export function QuickReplies() {
    const { state, dispatch, messageInputRef } = useMonitor();
    if (!state.showQuickReplies) return null;

    return (
        <div className="bg-wa-bg-deep border-t border-wa-border px-4 py-2 flex-shrink-0 max-h-40 overflow-y-auto">
            {QUICK_REPLIES.map((qr, i) => (
                <button
                    key={i}
                    onClick={() => {
                        dispatch({ type: 'SET_FIELD', field: 'messageInput', value: qr });
                        dispatch({ type: 'SET_FIELD', field: 'showQuickReplies', value: false });
                        messageInputRef.current?.focus();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-wa-text-secondary hover:text-white hover:bg-wa-bg-hover rounded transition-colors truncate"
                >
                    {qr}
                </button>
            ))}
        </div>
    );
}
