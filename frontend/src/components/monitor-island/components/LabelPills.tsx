import React, { useState } from 'react';
import { useMonitor } from '../MonitorProvider';
import { labelColor } from '../../../lib/monitor/format-helpers';

export function LabelPills() {
    const { selectedSession, availableLabels, assignLabel, removeLabel } = useMonitor();
    const [open, setOpen] = useState(false);
    if (!selectedSession) return null;

    const labels = selectedSession.labels ?? [];

    return (
        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            {labels.slice(0, 3).map(lbl => (
                <button
                    key={lbl.id}
                    onClick={() => removeLabel(lbl.id)}
                    className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full text-white/90 hover:opacity-80 transition-opacity"
                    style={{ background: labelColor(lbl.color) }}
                    title={`Remove ${lbl.name}`}
                >
                    <span>{lbl.name}</span>
                    <svg className="w-2.5 h-2.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            ))}

            {availableLabels.length > 0 && (
                <div className="relative">
                    <button
                        onClick={() => setOpen(!open)}
                        className="text-[9px] px-1.5 py-0.5 border border-wa-border text-wa-text-secondary rounded-full hover:border-wa-green hover:text-wa-green transition-colors"
                    >
                        + Label
                    </button>
                    {open && (
                        <div
                            className="absolute top-full right-0 mt-1 z-50 bg-wa-bg-deep border border-wa-border rounded-lg shadow-lg min-w-[160px] max-h-48 overflow-y-auto"
                            onMouseLeave={() => setOpen(false)}
                        >
                            {availableLabels.map(lbl => (
                                <button
                                    key={lbl.id}
                                    onClick={() => { assignLabel(lbl.id); setOpen(false); }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-wa-bg-hover flex items-center gap-2"
                                >
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: labelColor(lbl.color) }} />
                                    <span>{lbl.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
