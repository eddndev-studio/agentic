import React from 'react';
import { useFlowEditor } from '../FlowEditorProvider';

export function MobileEditorHeader() {
    const { flow, setFlow, bot, saving, save, templateId } = useFlowEditor();

    const backUrl = templateId
        ? `/templates/detail?id=${templateId}`
        : `/bots/detail?id=${bot.id || new URLSearchParams(window.location.search).get('botId') || ''}`;

    return (
        <header className="border-b border-wa-border px-4 pb-4 pt-3 space-y-2 flex-shrink-0">
            {/* Top row: back + badge + save */}
            <div className="flex items-center gap-3">
                <a href={backUrl} className="text-wa-text-secondary hover:text-wa-green transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </a>
                {bot.platform && (
                    <span className="text-[10px] text-wa-green bg-wa-green/10 border border-wa-green/20 px-2 py-0.5 rounded-md font-semibold">
                        {bot.platform}
                    </span>
                )}
                <button
                    onClick={save}
                    disabled={saving}
                    className="ml-auto inline-flex items-center justify-center font-sans transition-colors rounded-lg disabled:opacity-50 bg-wa-green text-white hover:bg-wa-green-hover px-4 py-2.5 text-xs"
                >
                    {saving ? 'Guardando...' : 'Guardar'}
                </button>
            </div>

            {/* Title */}
            <input
                type="text"
                value={flow.name}
                onChange={e => setFlow({ ...flow, name: e.target.value })}
                placeholder="Nombre del flujo"
                className="bg-transparent border-none outline-none text-wa-text-primary text-lg font-bold w-full"
            />

            {/* Description */}
            {flow.description && (
                <p className="text-xs text-wa-text-secondary truncate">{flow.description}</p>
            )}
        </header>
    );
}
