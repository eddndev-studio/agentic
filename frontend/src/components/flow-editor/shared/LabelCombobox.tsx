import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getLabelColor } from '../../../lib/label-colors';

interface LabelItem {
    id: string;
    name: string;
    color: number;
}

interface Props {
    labels: LabelItem[];
    selected: string[];
    onChange: (names: string[]) => void;
    placeholder?: string;
    accentColor?: string;
}

export function LabelCombobox({ labels, selected, onChange, placeholder = 'Buscar etiqueta...', accentColor = '#a552a1' }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const filtered = query
        ? labels.filter(l => l.name.toLowerCase().includes(query.toLowerCase()))
        : labels;

    const toggle = useCallback((name: string) => {
        if (selected.includes(name)) {
            onChange(selected.filter(n => n !== name));
        } else {
            onChange([...selected, name]);
        }
    }, [selected, onChange]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div ref={containerRef} className="relative">
            {/* Selected pills + input */}
            <div
                className="flex flex-wrap gap-1.5 p-2 bg-wa-bg-hover border border-wa-border rounded-lg min-h-[42px] cursor-text"
                onClick={() => { setOpen(true); inputRef.current?.focus(); }}
            >
                {selected.map(name => {
                    const lbl = labels.find(l => l.name === name);
                    return (
                        <span
                            key={name}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border"
                            style={{ color: accentColor, borderColor: `${accentColor}40`, background: `${accentColor}15` }}
                        >
                            {lbl && (
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getLabelColor(lbl.color) }} />
                            )}
                            {name}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggle(name); }}
                                className="ml-0.5 hover:text-red-400 transition-colors"
                            >
                                ×
                            </button>
                        </span>
                    );
                })}
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    placeholder={selected.length === 0 ? placeholder : ''}
                    className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-wa-text-primary text-sm placeholder-wa-text-secondary"
                />
                {/* Chevron */}
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                    className="flex items-center self-center text-wa-text-secondary ml-auto flex-shrink-0"
                >
                    <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>

            {/* Dropdown */}
            {open && (
                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-wa-bg-panel border border-wa-border shadow-lg py-1">
                    {filtered.length === 0 && (
                        <div className="px-3 py-2 text-xs text-wa-text-secondary">Sin resultados</div>
                    )}
                    {filtered.map(lbl => {
                        const isSelected = selected.includes(lbl.name);
                        return (
                            <button
                                key={lbl.id}
                                type="button"
                                onClick={() => toggle(lbl.name)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm cursor-pointer transition-colors border-none ${
                                    isSelected ? 'bg-wa-green/10 text-wa-text-primary' : 'text-wa-text-secondary hover:bg-wa-bg-hover hover:text-wa-text-primary'
                                }`}
                            >
                                {/* Checkbox */}
                                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                    isSelected ? 'bg-wa-green border-wa-green' : 'border-wa-border bg-transparent'
                                }`}>
                                    {isSelected && (
                                        <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </span>
                                {/* Color dot */}
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: getLabelColor(lbl.color) }} />
                                {/* Name */}
                                <span className="truncate">{lbl.name}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
