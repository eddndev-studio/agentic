import React, { useState } from 'react';
import { useMonitor } from '../MonitorProvider';
import { labelColor } from '../../../lib/monitor/format-helpers';
import { t } from '../../../i18n';

export function AdminMenu() {
    const {
        selectedSession, isAdmin, state, dispatch,
        openFlowModal, openToolModal, loadDebugContext, toggleAI,
        availableLabels, assignLabel, removeLabel,
    } = useMonitor();
    const [menuOpen, setMenuOpen] = useState(false);
    if (!selectedSession) return null;

    return (
        <div className="relative flex-shrink-0">
            <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-wa-text-secondary hover:text-wa-text-primary transition-colors rounded-full hover:bg-wa-bg-hover"
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="19" r="1.5" />
                </svg>
            </button>

            {menuOpen && (
                <div
                    className="absolute top-full right-0 mt-1 z-50 bg-wa-bg-header border border-wa-border rounded-lg shadow-lg min-w-[180px] py-1"
                    onMouseLeave={() => setMenuOpen(false)}
                >
                    {isAdmin && (
                        <>
                            <button onClick={() => { dispatch({ type: 'SET_FIELD', field: 'showForceAIModal', value: true }); setMenuOpen(false); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-wa-text-primary hover:bg-wa-bg-hover flex items-center gap-3">
                                <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                <span>{t('force_ai')}</span>
                            </button>
                            <button onClick={() => { openFlowModal(); setMenuOpen(false); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-wa-text-primary hover:bg-wa-bg-hover flex items-center gap-3">
                                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
                                <span>{t('run_flow')}</span>
                            </button>
                            <button onClick={() => { openToolModal(); setMenuOpen(false); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-wa-text-primary hover:bg-wa-bg-hover flex items-center gap-3">
                                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                <span>{t('run_tool')}</span>
                            </button>
                            <button onClick={() => { loadDebugContext(); setMenuOpen(false); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-wa-text-primary hover:bg-wa-bg-hover flex items-center gap-3">
                                <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4" /></svg>
                                <span>Debug AI</span>
                            </button>
                            <div className="border-t border-wa-border my-1" />
                            <button onClick={() => { toggleAI(); setMenuOpen(false); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-wa-text-primary hover:bg-wa-bg-hover flex items-center gap-3">
                                <svg className={`w-4 h-4 ${selectedSession.aiEnabled ? 'text-wa-green' : 'text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                <span>{selectedSession.aiEnabled ? 'Desactivar IA' : 'Activar IA'}</span>
                            </button>
                        </>
                    )}
                    <button onClick={() => { dispatch({ type: 'SET_FIELD', field: 'showNotesPanel', value: !state.showNotesPanel }); setMenuOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-wa-text-primary hover:bg-wa-bg-hover flex items-center gap-3">
                        <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        <span>Notas</span>
                        {selectedSession.notes && <span className="ml-auto w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />}
                    </button>

                    {/* Mobile labels */}
                    <div className="sm:hidden border-t border-wa-border mt-1 pt-1">
                        <div className="px-4 py-1.5 text-[10px] text-wa-text-secondary uppercase tracking-wider">Labels</div>
                        {(selectedSession.labels ?? []).map(lbl => (
                            <button key={`mob-${lbl.id}`} onClick={() => { removeLabel(lbl.id); setMenuOpen(false); }}
                                className="w-full text-left px-4 py-2 text-sm text-wa-text-primary hover:bg-wa-bg-hover flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: labelColor(lbl.color) }} />
                                <span>{lbl.name}</span>
                                <svg className="w-3 h-3 ml-auto text-wa-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        ))}
                        {availableLabels.map(lbl => (
                            <button key={`mob-add-${lbl.id}`} onClick={() => { assignLabel(lbl.id); setMenuOpen(false); }}
                                className="w-full text-left px-4 py-2 text-sm text-wa-text-secondary hover:bg-wa-bg-hover flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: labelColor(lbl.color) }} />
                                <span>+ {lbl.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
