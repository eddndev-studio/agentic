import React from 'react';
import type { EditorTab } from '../EditorShell';

interface Props {
    activeTab: EditorTab;
    onTabChange: (tab: EditorTab) => void;
}

const tabs: { id: EditorTab; label: string }[] = [
    { id: 'steps', label: 'Pasos' },
    { id: 'triggers', label: 'Triggers' },
    { id: 'settings', label: 'Ajustes' },
];

export function MobileTabBar({ activeTab, onTabChange }: Props) {
    return (
        <div className="flex gap-1 border-b border-wa-border overflow-x-auto flex-shrink-0 px-2">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`px-4 py-2.5 text-xs font-sans transition-colors rounded-t-lg whitespace-nowrap border-none cursor-pointer bg-transparent ${
                        activeTab === tab.id
                            ? 'text-wa-green border-b-2 border-wa-green bg-wa-green/5'
                            : 'text-wa-text-secondary hover:text-white'
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
