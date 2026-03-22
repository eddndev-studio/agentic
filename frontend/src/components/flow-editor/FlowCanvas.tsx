import React, { useMemo, useCallback, useEffect, useState } from 'react';
import {
    ReactFlow,
    Controls,
    MiniMap,
    Background,
    BackgroundVariant,
    useNodesState,
    useEdgesState,
    type NodeTypes,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useFlowEditor } from './FlowEditorProvider';
import { stepsToNodesAndEdges } from './lib/node-factory';
import { applyAutoLayout, needsAutoLayout } from './hooks/useAutoLayout';

import { TextNode } from './nodes/TextNode';
import { MediaNode } from './nodes/MediaNode';
import { ToolNode } from './nodes/ToolNode';
import { ConditionalTimeNode } from './nodes/ConditionalTimeNode';
import { TriggerNode } from './nodes/TriggerNode';

const nodeTypes: NodeTypes = {
    textNode: TextNode,
    mediaNode: MediaNode,
    toolNode: ToolNode,
    conditionalTimeNode: ConditionalTimeNode,
    triggerNode: TriggerNode,
};

interface FlowCanvasProps {
    onNodeSelect?: (nodeId: string | null) => void;
}

export function FlowCanvas({ onNodeSelect }: FlowCanvasProps) {
    const { flow, setFlow } = useFlowEditor();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [initialized, setInitialized] = useState(false);

    // Convert flow data to nodes/edges when flow changes
    useEffect(() => {
        const { nodes: rawNodes, edges: newEdges } = stepsToNodesAndEdges(flow.steps, flow.triggers);

        let finalNodes = rawNodes;
        if (needsAutoLayout(rawNodes) && rawNodes.length > 0) {
            finalNodes = applyAutoLayout(rawNodes, newEdges);
        }

        setNodes(finalNodes);
        setEdges(newEdges);
        if (!initialized && finalNodes.length > 0) {
            setInitialized(true);
        }
    }, [flow.steps, flow.triggers]);

    // Save node positions back to flow when dragged
    const handleNodeDragStop = useCallback((_: any, node: Node) => {
        if (node.id === 'trigger-node') return;

        setFlow((prev: any) => {
            const steps = prev.steps.map((s: any) => {
                const id = s.id || `temp-${s.tempId}`;
                if (id === node.id) {
                    return {
                        ...s,
                        metadata: {
                            ...s.metadata,
                            position: { x: node.position.x, y: node.position.y },
                        },
                    };
                }
                return s;
            });
            return { ...prev, steps };
        });
    }, [setFlow]);

    const handleNodeClick = useCallback((_: any, node: Node) => {
        onNodeSelect?.(node.id === 'trigger-node' ? 'triggers' : node.id);
    }, [onNodeSelect]);

    const handlePaneClick = useCallback(() => {
        onNodeSelect?.(null);
    }, [onNodeSelect]);

    return (
        <div style={{ width: '100%', height: '100%', background: '#0b141a' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={handleNodeDragStop}
                onNodeClick={handleNodeClick}
                onPaneClick={handlePaneClick}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                proOptions={{ hideAttribution: true }}
                style={{ background: '#0b141a' }}
                defaultEdgeOptions={{
                    type: 'smoothstep',
                    style: { stroke: '#2a3942', strokeWidth: 2 },
                }}
            >
                <Controls
                    position="bottom-left"
                    style={{ background: '#111b21', border: '1px solid #2a3942', borderRadius: 8 }}
                />
                <MiniMap
                    position="bottom-right"
                    nodeColor="#111b21"
                    maskColor="#0b141a90"
                    style={{ background: '#0b141a', border: '1px solid #2a3942', borderRadius: 8 }}
                />
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2a394240" />
            </ReactFlow>
        </div>
    );
}
