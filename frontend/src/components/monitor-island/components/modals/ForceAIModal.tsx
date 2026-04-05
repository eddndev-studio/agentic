import React from 'react';
import { useMonitor } from '../../MonitorProvider';
import { Modal } from './Modal';
import { t } from '../../../../i18n';

export function ForceAIModal() {
    const { state, dispatch, forceAI } = useMonitor();

    return (
        <Modal show={state.showForceAIModal} onClose={() => dispatch({ type: 'SET_FIELD', field: 'showForceAIModal', value: false })}>
            <h3 className="text-sm font-bold mb-2">{t('force_ai')}</h3>
            <p className="text-xs text-wa-text-secondary mb-4">{t('force_ai_desc')}</p>
            <textarea
                value={state.forceAIContext}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'forceAIContext', value: e.target.value })}
                rows={3}
                className="w-full bg-wa-bg-hover border border-wa-border text-white text-sm p-3 focus:border-wa-green focus:outline-none resize-y mb-4 rounded-lg"
                placeholder={t('force_ai_context')}
            />
            <div className="flex justify-end gap-2">
                <button
                    onClick={() => dispatch({ type: 'SET_FIELD', field: 'showForceAIModal', value: false })}
                    className="inline-flex items-center justify-center font-sans transition-colors rounded-lg px-4 py-2.5 text-xs border border-wa-border text-wa-text-secondary hover:bg-wa-bg-hover"
                >
                    {t('cancel')}
                </button>
                <button
                    onClick={forceAI}
                    className="inline-flex items-center justify-center font-sans transition-colors rounded-lg disabled:opacity-50 px-4 py-2.5 text-xs bg-yellow-600 text-white hover:bg-yellow-700"
                >
                    {t('confirm')}
                </button>
            </div>
        </Modal>
    );
}
