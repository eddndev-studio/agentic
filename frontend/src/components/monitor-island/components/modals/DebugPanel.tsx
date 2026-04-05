import React from 'react';
import { useMonitor } from '../../MonitorProvider';

export function DebugPanel() {
    const { state, dispatch, loadDebugContext } = useMonitor();
    const { showDebugPanel, loadingDebug, debugData } = state;

    if (!showDebugPanel) return null;

    const close = () => dispatch({ type: 'SET_FIELD', field: 'showDebugPanel', value: false });

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4" onClick={close}>
            <div
                className="bg-wa-bg-panel border border-wa-border w-full sm:max-w-3xl sm:max-h-[85vh] h-full sm:h-auto sm:rounded-xl flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-wa-border flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                        <h3 className="text-sm font-bold">Debug AI Context</h3>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={loadDebugContext} className="text-[10px] text-wa-text-secondary hover:text-wa-green transition-colors">Refresh</button>
                        <button onClick={close} className="text-wa-text-secondary hover:text-white transition-colors text-lg leading-none">&times;</button>
                    </div>
                </div>

                {/* Loading */}
                {loadingDebug && (
                    <div className="flex-1 flex items-center justify-center">
                        <span className="text-xs text-wa-text-secondary animate-pulse">Cargando contexto...</span>
                    </div>
                )}

                {/* Content */}
                {!loadingDebug && debugData && (
                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                        {/* Config summary */}
                        <div className="flex flex-wrap gap-2">
                            <span className="text-[10px] px-2 py-1 rounded bg-wa-bg-hover border border-wa-border text-wa-text-secondary">Provider: {debugData.config?.aiProvider}</span>
                            <span className="text-[10px] px-2 py-1 rounded bg-wa-bg-hover border border-wa-border text-wa-text-secondary">Model: {debugData.config?.aiModel}</span>
                            <span className="text-[10px] px-2 py-1 rounded bg-wa-bg-hover border border-wa-border text-wa-text-secondary">Temp: {debugData.config?.temperature}</span>
                            <span className="text-[10px] px-2 py-1 rounded bg-wa-bg-hover border border-wa-border text-wa-text-secondary">Context: {debugData.config?.contextMessages} msgs</span>
                            <span className={`text-[10px] px-2 py-1 rounded border ${debugData.config?.autoReadReceipts ? 'border-wa-green/30 text-wa-green bg-wa-green/10' : 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'}`}>
                                {debugData.config?.autoReadReceipts ? 'Auto-read: ON' : 'Auto-read: OFF'}
                            </span>
                        </div>

                        {/* System Prompt */}
                        <div>
                            <h4 className="text-[10px] text-wa-green tracking-widest uppercase mb-2">System Prompt</h4>
                            <pre className="bg-wa-bg-deep border border-wa-border rounded-lg p-3 text-[11px] text-wa-text-secondary font-mono whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                                {debugData.systemPrompt || '(vacío)'}
                            </pre>
                        </div>

                        {/* Chat Context */}
                        <div>
                            <h4 className="text-[10px] text-wa-green tracking-widest uppercase mb-2">
                                Chat Context <span className="text-wa-text-secondary normal-case">({debugData.chatContext?.length ?? 0} mensajes)</span>
                            </h4>
                            <div className="bg-wa-bg-deep border border-wa-border rounded-lg p-3 max-h-64 overflow-y-auto space-y-0.5">
                                {(debugData.chatContext ?? []).map((line, i) => (
                                    <div key={i} className={`text-[11px] font-mono leading-relaxed ${line.includes('Bot]') ? 'text-wa-green/80' : 'text-wa-text-secondary'}`}>
                                        {line}
                                    </div>
                                ))}
                                {(!debugData.chatContext || debugData.chatContext.length === 0) && (
                                    <div className="text-[11px] text-wa-text-secondary italic">Sin mensajes de contexto</div>
                                )}
                            </div>
                        </div>

                        {/* Conversation History */}
                        <div>
                            <h4 className="text-[10px] text-wa-green tracking-widest uppercase mb-2">
                                Conversation History (AI Memory) <span className="text-wa-text-secondary normal-case">({debugData.conversationHistory?.length ?? 0} entries)</span>
                            </h4>
                            <div className="bg-wa-bg-deep border border-wa-border rounded-lg p-3 max-h-64 overflow-y-auto space-y-1.5">
                                {(debugData.conversationHistory ?? []).map((msg, i) => (
                                    <div key={i} className="text-[11px] font-mono leading-relaxed">
                                        <span className={`font-bold ${
                                            msg.role === 'user' ? 'text-blue-400' :
                                            msg.role === 'assistant' ? 'text-wa-green' :
                                            msg.role === 'tool' ? 'text-yellow-400' : 'text-purple-400'
                                        }`}>
                                            [{msg.role}]
                                        </span>
                                        <span className="text-wa-text-secondary">
                                            {msg.content ? (msg.content.length > 200 ? msg.content.substring(0, 200) + '...' : msg.content) : ''}
                                        </span>
                                        {msg.toolCalls?.length ? (
                                            <span className="text-purple-400"> → tools: {msg.toolCalls.map(tc => tc.name).join(', ')}</span>
                                        ) : null}
                                    </div>
                                ))}
                                {(!debugData.conversationHistory || debugData.conversationHistory.length === 0) && (
                                    <div className="text-[11px] text-wa-text-secondary italic">Sin historial de conversación</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
