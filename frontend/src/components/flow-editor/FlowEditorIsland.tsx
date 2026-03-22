import React, { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowEditorProvider, useFlowEditor } from './FlowEditorProvider';
import { FlowCanvas } from './FlowCanvas';
import { Toolbar } from './Toolbar';
import { StepDetailPanel } from './panels/StepDetailPanel';
import { TriggerPanel } from './panels/TriggerPanel';
import { FlowSettingsPanel } from './panels/FlowSettingsPanel';

function EditorInner() {
    const { flow, setFlow, bot, saving, save, flowId, templateId } = useFlowEditor();
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'step' | 'triggers' | 'settings'>('step');

    const handleNodeSelect = (nodeId: string | null) => {
        if (nodeId === 'triggers') {
            setActiveTab('triggers');
            setSelectedNodeId(null);
        } else if (nodeId) {
            setSelectedNodeId(nodeId);
            setActiveTab('step');
        } else {
            setSelectedNodeId(null);
        }
    };

    const backUrl = templateId
        ? `/templates/detail?id=${templateId}`
        : `/bots/detail?id=${bot.id || new URLSearchParams(window.location.search).get('botId') || ''}`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
            {/* Header */}
            <header style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: 12, paddingBottom: 12, marginBottom: 0,
                borderBottom: '1px solid #2a3942', flexShrink: 0,
            }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {bot.platform && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{
                                fontSize: 10, color: '#00a884', background: '#00a88415',
                                padding: '2px 8px', borderRadius: 8,
                            }}>{bot.platform}</span>
                            <span style={{ fontSize: 10, color: '#8696a0' }}>{bot.identifier}</span>
                        </div>
                    )}
                    <input
                        type="text"
                        value={flow.name}
                        onChange={e => setFlow({ ...flow, name: e.target.value })}
                        placeholder="Flow name"
                        style={{
                            background: 'transparent', border: 'none', outline: 'none',
                            color: '#e9edef', fontSize: 20, fontWeight: 700, width: '100%',
                        }}
                    />
                    <input
                        type="text"
                        value={flow.description}
                        onChange={e => setFlow({ ...flow, description: e.target.value })}
                        placeholder="Description"
                        style={{
                            background: 'transparent', border: 'none', outline: 'none',
                            color: '#8696a0', fontSize: 11, width: '100%', marginTop: 2,
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <a href={backUrl} style={{
                        padding: '8px 20px', border: '1px solid #2a3942', borderRadius: 8,
                        color: '#8696a0', fontSize: 11, textDecoration: 'none',
                        display: 'flex', alignItems: 'center',
                    }}>Back</a>
                    <button onClick={save} disabled={saving} style={{
                        padding: '8px 20px', background: '#00a884', borderRadius: 8,
                        color: 'white', fontSize: 11, border: 'none', cursor: 'pointer',
                        opacity: saving ? 0.5 : 1,
                    }}>
                        {saving ? 'Saving...' : 'Save Flow'}
                    </button>
                </div>
            </header>

            {/* Main area */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                {/* Canvas */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <FlowCanvas onNodeSelect={handleNodeSelect} />
                    <Toolbar />
                </div>

                {/* Right panel */}
                {(selectedNodeId || activeTab !== 'step') && (
                    <div style={{
                        width: 320, background: '#111b21', borderLeft: '1px solid #2a3942',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}>
                        {/* Tab bar */}
                        <div style={{
                            display: 'flex', borderBottom: '1px solid #2a3942', flexShrink: 0,
                        }}>
                            {selectedNodeId && (
                                <TabBtn active={activeTab === 'step'} onClick={() => setActiveTab('step')}>Step</TabBtn>
                            )}
                            <TabBtn active={activeTab === 'triggers'} onClick={() => setActiveTab('triggers')}>Triggers</TabBtn>
                            <TabBtn active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>Settings</TabBtn>
                        </div>

                        {/* Panel content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                            {activeTab === 'step' && selectedNodeId && (
                                <StepDetailPanel stepId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
                            )}
                            {activeTab === 'triggers' && <TriggerPanel />}
                            {activeTab === 'settings' && <FlowSettingsPanel />}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick} style={{
            flex: 1, padding: '8px 0', fontSize: 10, fontWeight: 600,
            fontFamily: 'ui-monospace, monospace', border: 'none', cursor: 'pointer',
            background: active ? '#111b21' : '#0b141a',
            color: active ? '#00a884' : '#8696a0',
            borderBottom: active ? '2px solid #00a884' : '2px solid transparent',
        }}>
            {children}
        </button>
    );
}

export default function FlowEditorIsland() {
    return (
        <ReactFlowProvider>
            <FlowEditorProvider>
                <EditorInner />
            </FlowEditorProvider>
        </ReactFlowProvider>
    );
}
