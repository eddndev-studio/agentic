import React from 'react';
import { StepDetailPanel } from './panels/StepDetailPanel';
import { TriggerPanel } from './panels/TriggerPanel';
import { FlowSettingsPanel } from './panels/FlowSettingsPanel';
import type { EditorTab } from './EditorShell';

interface Props {
    selectedNodeId: string | null;
    activeTab: EditorTab;
    onTabChange: (tab: EditorTab) => void;
    onCloseStep: () => void;
}

export function DesktopRightPanel({ selectedNodeId, activeTab, onTabChange, onCloseStep }: Props) {
    if (!selectedNodeId && activeTab === 'steps') return null;

    return (
        <div className="w-[320px] lg:w-[380px] bg-wa-bg-panel border-l border-wa-border flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-wa-border flex-shrink-0">
                {selectedNodeId && (
                    <TabBtn active={activeTab === 'steps'} onClick={() => onTabChange('steps')}>Step</TabBtn>
                )}
                <TabBtn active={activeTab === 'triggers'} onClick={() => onTabChange('triggers')}>Triggers</TabBtn>
                <TabBtn active={activeTab === 'settings'} onClick={() => onTabChange('settings')}>Settings</TabBtn>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-3.5">
                {activeTab === 'steps' && selectedNodeId && (
                    <StepDetailPanel stepId={selectedNodeId} onClose={onCloseStep} />
                )}
                {activeTab === 'triggers' && <TriggerPanel />}
                {activeTab === 'settings' && <FlowSettingsPanel />}
            </div>
        </div>
    );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 py-2.5 text-[10px] font-semibold font-mono border-none cursor-pointer transition-colors ${
                active
                    ? 'bg-wa-bg-panel text-wa-green border-b-2 border-wa-green'
                    : 'bg-wa-bg-deep text-wa-text-secondary border-b-2 border-transparent'
            }`}
        >
            {children}
        </button>
    );
}
