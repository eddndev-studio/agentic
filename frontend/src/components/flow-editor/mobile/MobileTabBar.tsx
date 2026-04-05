import React from 'react';
import type { EditorTab } from '../EditorShell';

interface Props {
    activeTab: EditorTab;
    onTabChange: (tab: EditorTab) => void;
}

const tabs: { id: EditorTab; label: string }[] = [
    { id: 'steps', label: 'Steps' },
    { id: 'triggers', label: 'Triggers' },
    { id: 'settings', label: 'Settings' },
];

export function MobileTabBar({ activeTab, onTabChange }: Props) {
    return (
        <div className="flex border-b border-wa-border flex-shrink-0 bg-wa-bg-panel">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`flex-1 py-3 text-xs font-semibold font-mono uppercase tracking-wider border-none cursor-pointer transition-colors ${
                        activeTab === tab.id
                            ? 'text-wa-green border-b-2 border-wa-green bg-wa-bg-panel'
                            : 'text-wa-text-secondary bg-wa-bg-deep border-b-2 border-transparent'
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
