import React from 'react';
import { useMonitor } from '../../MonitorProvider';
import { Modal } from './Modal';
import { t } from '../../../../i18n';

export function RunFlowModal() {
    const { state, dispatch, executeFlow } = useMonitor();

    return (
        <Modal show={state.showFlowModal} onClose={() => dispatch({ type: 'SET_FIELD', field: 'showFlowModal', value: false })}>
            <h3 className="text-sm font-bold mb-4">{t('run_flow')}</h3>
            <select
                value={state.selectedFlowId}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'selectedFlowId', value: e.target.value })}
                className="w-full bg-wa-bg-hover border border-wa-border text-white text-sm p-3 focus:border-wa-green focus:outline-none mb-4 rounded-lg"
            >
                <option value="">{t('select_flow')}</option>
                {state.flows.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
                <button
                    onClick={() => dispatch({ type: 'SET_FIELD', field: 'showFlowModal', value: false })}
                    className="inline-flex items-center justify-center font-sans transition-colors rounded-lg px-4 py-2.5 text-xs border border-wa-border text-wa-text-secondary hover:bg-wa-bg-hover"
                >
                    {t('cancel')}
                </button>
                <button
                    onClick={executeFlow}
                    disabled={!state.selectedFlowId}
                    className="inline-flex items-center justify-center font-sans transition-colors rounded-lg disabled:opacity-50 px-4 py-2.5 text-xs bg-blue-600 text-white hover:bg-blue-700"
                >
                    {t('execute')}
                </button>
            </div>
        </Modal>
    );
}
