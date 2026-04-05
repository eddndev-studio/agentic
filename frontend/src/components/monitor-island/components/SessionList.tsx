import React, { useState } from 'react';
import { useMonitor } from '../MonitorProvider';
import { SessionItem } from './SessionItem';
import { SessionListSkeleton } from './SessionListSkeleton';
import { t } from '../../../i18n';
import { labelColor } from '../../../lib/monitor/format-helpers';

export function SessionList() {
    const {
        state, dispatch, loadSessions, loadMoreSessions, onSessionsScroll,
        selectSession, searchInputRef,
    } = useMonitor();
    const { sessions, selectedSessionId, sessionsLoaded, totalSessions, botName,
        searchQuery, filterLabelId, botLabels, loadingMoreSessions, hasMoreSessions,
        unreadCounts, typingSessions } = state;

    const [filterOpen, setFilterOpen] = useState(false);

    const goBack = () => {
        try {
            const role = JSON.parse(localStorage.getItem('user') || '{}').role;
            if (role === 'WORKER') {
                window.location.href = '/worker';
            } else {
                window.location.href = state.botId ? `/bots/detail?id=${state.botId}` : '/bots';
            }
        } catch {
            window.location.href = '/bots';
        }
    };

    return (
        <div
            className={`flex-col border-r border-wa-border min-h-0 bg-wa-bg-panel transition-transform duration-300 ease-out ${
                selectedSessionId ? 'hidden md:flex md:w-[280px] lg:w-[360px] md:flex-shrink-0' : 'flex w-full md:w-[280px] lg:w-[360px] md:flex-shrink-0'
            }`}
        >
            {/* Header */}
            <div className="h-14 bg-wa-bg-header flex items-center px-4 gap-3 flex-shrink-0">
                <a href="#" onClick={(e) => { e.preventDefault(); goBack(); }} className="text-wa-text-secondary hover:text-wa-green transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </a>
                <h1 className="text-base font-semibold flex-1">{botName || t('monitor')}</h1>
                {totalSessions > 0 && (
                    <span className="text-[10px] text-wa-text-secondary bg-wa-bg-hover px-2 py-0.5 rounded-full">
                        {totalSessions} chats
                    </span>
                )}
            </div>

            {/* Search + filter */}
            <div className="p-2 bg-wa-bg-panel">
                <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wa-text-secondary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={e => {
                                dispatch({ type: 'SET_FIELD', field: 'searchQuery', value: e.target.value });
                            }}
                            onKeyUp={() => loadSessions()}
                            className="w-full bg-wa-bg-hover text-wa-text-primary text-sm py-1.5 pl-9 pr-3 rounded-full focus:outline-none placeholder-wa-text-secondary"
                            placeholder={t('search_sessions')}
                        />
                    </div>
                    {/* Label filter */}
                    {botLabels.length > 0 && (
                        <div className="relative flex-shrink-0">
                            <button
                                onClick={() => setFilterOpen(!filterOpen)}
                                className={`h-8 px-2.5 rounded-full flex items-center gap-1.5 transition-colors text-[11px] ${
                                    filterLabelId ? 'bg-wa-green/15 text-wa-green' : 'bg-wa-bg-hover text-wa-text-secondary hover:text-white'
                                }`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                                {filterLabelId && (
                                    <>
                                        <span className="max-w-[80px] truncate">
                                            {botLabels.find(l => l.id === filterLabelId)?.name ?? ''}
                                        </span>
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                dispatch({ type: 'SET_FIELD', field: 'filterLabelId', value: '' });
                                                setFilterOpen(false);
                                                loadSessions();
                                            }}
                                            className="hover:text-red-400"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </span>
                                    </>
                                )}
                            </button>
                            {filterOpen && (
                                <div className="absolute top-full right-0 mt-1 z-50 bg-wa-bg-deep border border-wa-border rounded-xl shadow-xl w-56 max-h-72 overflow-hidden">
                                    <div className="px-3 py-2 border-b border-wa-border">
                                        <span className="text-[10px] text-wa-text-secondary uppercase tracking-wider font-medium">Filtrar por etiqueta</span>
                                    </div>
                                    <div className="max-h-56 overflow-y-auto py-1">
                                        <button
                                            onClick={() => { dispatch({ type: 'SET_FIELD', field: 'filterLabelId', value: '' }); loadSessions(); setFilterOpen(false); }}
                                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 transition-colors ${
                                                !filterLabelId ? 'bg-wa-green/10 text-wa-green' : 'text-wa-text-secondary hover:text-white hover:bg-wa-bg-hover'
                                            }`}
                                        >
                                            <span className="w-3 h-3 rounded-full bg-wa-bg-hover border border-wa-border flex-shrink-0" />
                                            <span>Todos</span>
                                            <span className="ml-auto text-[10px] text-wa-text-secondary">{totalSessions}</span>
                                        </button>
                                        {botLabels.map(lbl => (
                                            <button
                                                key={lbl.id}
                                                onClick={() => {
                                                    dispatch({ type: 'SET_FIELD', field: 'filterLabelId', value: lbl.id });
                                                    loadSessions();
                                                    setFilterOpen(false);
                                                }}
                                                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 transition-colors ${
                                                    filterLabelId === lbl.id ? 'bg-wa-bg-hover text-white' : 'text-wa-text-secondary hover:text-white hover:bg-wa-bg-hover'
                                                }`}
                                            >
                                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: labelColor(lbl.color) }} />
                                                <span className="truncate">{lbl.name}</span>
                                                {lbl.sessionCount != null && <span className="ml-auto text-[10px] text-wa-text-secondary">{lbl.sessionCount}</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Session items */}
            <div className="flex-1 overflow-y-auto" onScroll={onSessionsScroll}>
                {sessions.length === 0 && !sessionsLoaded && <SessionListSkeleton />}
                {sessions.length === 0 && sessionsLoaded && (
                    <div className="p-6 text-center text-sm text-wa-text-secondary">{t('no_sessions')}</div>
                )}

                {sessions.map(s => (
                    <SessionItem
                        key={s.id}
                        session={s}
                        isSelected={selectedSessionId === s.id}
                        unreadCount={unreadCounts[s.id] ?? 0}
                        isTyping={typingSessions[s.id] ?? false}
                        timeTick={state.timeTick}
                        onSelect={() => selectSession(s.id, s.notes ?? '')}
                    />
                ))}

                {loadingMoreSessions && (
                    <div className="p-3 text-center">
                        <div className="inline-block w-5 h-5 border-2 border-wa-green/30 border-t-wa-green rounded-full animate-spin" />
                    </div>
                )}
                {!loadingMoreSessions && hasMoreSessions && (
                    <div className="p-2 text-center text-xs text-wa-text-secondary cursor-pointer hover:text-wa-green" onClick={loadMoreSessions}>
                        Cargar mas...
                    </div>
                )}
            </div>
        </div>
    );
}
