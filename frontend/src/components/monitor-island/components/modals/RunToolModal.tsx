import React from 'react';
import { useMonitor } from '../../MonitorProvider';
import { Modal } from './Modal';
import { t } from '../../../../i18n';

export function RunToolModal() {
    const { state, dispatch, executeTool } = useMonitor();

    return (
        <Modal show={state.showToolModal} onClose={() => dispatch({ type: 'SET_FIELD', field: 'showToolModal', value: false })}>
            <h3 className="text-sm font-bold mb-4">{t('run_tool')}</h3>
            <select
                value={state.selectedToolName}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'selectedToolName', value: e.target.value })}
                className="w-full bg-wa-bg-hover border border-wa-border text-white text-sm p-3 focus:border-wa-green focus:outline-none mb-3 rounded-lg"
            >
                <option value="">{t('select_tool')}</option>
                {state.tools.map(tool => (
                    <option key={tool.id} value={tool.name}>{tool.name}</option>
                ))}
            </select>
            <label className="block text-[10px] text-wa-text-secondary mb-1">{t('tool_arguments')}</label>
            <textarea
                value={state.toolArgsJson}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'toolArgsJson', value: e.target.value })}
                rows={4}
                placeholder='{ "key": "value" }'
                className="w-full bg-wa-bg-hover border border-wa-border text-white text-xs font-mono p-3 focus:border-wa-green focus:outline-none resize-y mb-4 rounded-lg"
            />
            <div className="flex justify-end gap-2">
                <button
                    onClick={() => dispatch({ type: 'SET_FIELD', field: 'showToolModal', value: false })}
                    className="inline-flex items-center justify-center font-sans transition-colors rounded-lg px-4 py-2.5 text-xs border border-wa-border text-wa-text-secondary hover:bg-wa-bg-hover"
                >
                    {t('cancel')}
                </button>
                <button
                    onClick={executeTool}
                    disabled={!state.selectedToolName}
                    className="inline-flex items-center justify-center font-sans transition-colors rounded-lg disabled:opacity-50 px-4 py-2.5 text-xs bg-green-600 text-white hover:bg-green-700"
                >
                    {t('execute')}
                </button>
            </div>
        </Modal>
    );
}
