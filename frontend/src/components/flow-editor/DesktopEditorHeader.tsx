import React from 'react';
import { useFlowEditor } from './FlowEditorProvider';

export function DesktopEditorHeader() {
    const { flow, setFlow, bot, saving, save, flowId, templateId } = useFlowEditor();

    const backUrl = templateId
        ? `/templates/detail?id=${templateId}`
        : `/bots/detail?id=${bot.id || new URLSearchParams(window.location.search).get('botId') || ''}`;

    return (
        <header className="flex justify-between items-center gap-3 pb-3 mb-0 border-b border-wa-border flex-shrink-0">
            <div className="flex-1 min-w-0">
                {bot.platform && (
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] text-wa-green bg-wa-green/10 px-2 py-0.5 rounded-lg">{bot.platform}</span>
                        <span className="text-[10px] text-wa-text-secondary">{bot.identifier}</span>
                    </div>
                )}
                <input
                    type="text"
                    value={flow.name}
                    onChange={e => setFlow({ ...flow, name: e.target.value })}
                    placeholder="Flow name"
                    className="bg-transparent border-none outline-none text-wa-text-primary text-xl font-bold w-full"
                />
                <input
                    type="text"
                    value={flow.description}
                    onChange={e => setFlow({ ...flow, description: e.target.value })}
                    placeholder="Description"
                    className="bg-transparent border-none outline-none text-wa-text-secondary text-xs w-full mt-0.5"
                />
            </div>

            <div className="flex gap-2 flex-shrink-0">
                <a
                    href={backUrl}
                    className="px-5 py-2 border border-wa-border rounded-lg text-wa-text-secondary text-xs no-underline flex items-center"
                >
                    Back
                </a>
                <button
                    onClick={save}
                    disabled={saving}
                    className="px-5 py-2 bg-wa-green rounded-lg text-white text-xs border-none cursor-pointer disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save Flow'}
                </button>
            </div>
        </header>
    );
}
