import React from 'react';
import { useFlowEditor } from '../FlowEditorProvider';

export function MobileEditorHeader() {
    const { flow, setFlow, bot, saving, save, templateId } = useFlowEditor();

    const backUrl = templateId
        ? `/templates/detail?id=${templateId}`
        : `/bots/detail?id=${bot.id || new URLSearchParams(window.location.search).get('botId') || ''}`;

    return (
        <header className="flex items-center gap-2 px-3 py-2.5 bg-wa-bg-header border-b border-wa-border flex-shrink-0">
            <a href={backUrl} className="w-10 h-10 flex items-center justify-center text-wa-text-secondary hover:text-wa-green transition-colors flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
            </a>

            <div className="flex-1 min-w-0">
                <input
                    type="text"
                    value={flow.name}
                    onChange={e => setFlow({ ...flow, name: e.target.value })}
                    placeholder="Flow name"
                    className="bg-transparent border-none outline-none text-wa-text-primary text-base font-bold w-full truncate"
                />
                {bot.platform && (
                    <span className="text-[10px] text-wa-green bg-wa-green/10 px-1.5 py-0.5 rounded">{bot.platform}</span>
                )}
            </div>

            <button
                onClick={save}
                disabled={saving}
                className="w-10 h-10 flex items-center justify-center bg-wa-green text-white rounded-lg flex-shrink-0 disabled:opacity-50"
            >
                {saving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                )}
            </button>
        </header>
    );
}
