import React, { useState } from 'react';
import { useFlowEditor } from './FlowEditorProvider';
import { useIsMobile } from './hooks/useIsMobile';
import { FlowCanvas } from './FlowCanvas';
import { Toolbar } from './Toolbar';
import { TriggerPanel } from './panels/TriggerPanel';
import { FlowSettingsPanel } from './panels/FlowSettingsPanel';

// Mobile components
import { MobileEditorHeader } from './mobile/MobileEditorHeader';
import { MobileTabBar } from './mobile/MobileTabBar';
import { MobileStepsList } from './mobile/MobileStepsList';
import { MobileAddStepBar } from './mobile/MobileAddStepBar';

// Desktop components
import { DesktopEditorHeader } from './DesktopEditorHeader';
import { DesktopRightPanel } from './DesktopRightPanel';

export type EditorTab = 'steps' | 'triggers' | 'settings';

export function EditorShell() {
    const isMobile = useIsMobile();
    const { flow, saving, save } = useFlowEditor();
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<EditorTab>('steps');

    const handleNodeSelect = (nodeId: string | null) => {
        if (nodeId === 'triggers') {
            setActiveTab('triggers');
            setSelectedNodeId(null);
        } else if (nodeId) {
            setSelectedNodeId(nodeId);
            setActiveTab('steps');
        } else {
            setSelectedNodeId(null);
        }
    };

    if (isMobile) {
        return (
            <div className="flex flex-col h-full bg-wa-bg-deep overflow-hidden">
                <MobileEditorHeader />
                <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />

                <div className="flex-1 overflow-y-auto min-h-0">
                    {activeTab === 'steps' && <MobileStepsList />}
                    {activeTab === 'triggers' && (
                        <div className="p-4">
                            <TriggerPanel />
                        </div>
                    )}
                    {activeTab === 'settings' && (
                        <div className="p-4">
                            <FlowSettingsPanel />
                        </div>
                    )}
                </div>

                {activeTab === 'steps' && <MobileAddStepBar />}
            </div>
        );
    }

    // Desktop layout
    return (
        <div className="flex flex-col h-full">
            <DesktopEditorHeader />

            <div className="flex flex-1 overflow-hidden min-h-0">
                {/* Canvas */}
                <div className="flex-1 relative">
                    <FlowCanvas onNodeSelect={handleNodeSelect} />
                    <Toolbar />
                </div>

                {/* Right panel */}
                <DesktopRightPanel
                    selectedNodeId={selectedNodeId}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    onCloseStep={() => setSelectedNodeId(null)}
                />
            </div>
        </div>
    );
}
