import type { Node, Edge } from '@xyflow/react';
import type { Step, Trigger, StepNodeData, TriggerNodeData } from './types';
import { nodeStyle } from './theme';

/**
 * Convert Step[] and Trigger[] to React Flow Node[] + Edge[].
 * Uses stored positions from step.metadata.position if available.
 */
export function stepsToNodesAndEdges(
    steps: Step[],
    triggers: Trigger[]
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const startX = 0;
    let currentY = 0;

    // Trigger node (entry point)
    if (triggers.length > 0) {
        nodes.push({
            id: 'trigger-node',
            type: 'triggerNode',
            position: { x: startX, y: currentY },
            data: { triggers } as TriggerNodeData,
            draggable: true,
        });
        currentY += 120;
    }

    // Step nodes
    const sorted = [...steps].sort((a, b) => a.order - b.order);
    sorted.forEach((step, index) => {
        const id = step.id || `temp-${step.tempId || index}`;
        const storedPos = step.metadata?.position;

        nodes.push({
            id,
            type: getNodeType(step.type),
            position: storedPos
                ? { x: storedPos.x, y: storedPos.y }
                : { x: startX, y: currentY },
            data: { step, index } as StepNodeData,
            draggable: true,
        });

        // Edge from trigger to first step
        if (index === 0 && triggers.length > 0) {
            edges.push({
                id: `trigger-to-${id}`,
                source: 'trigger-node',
                target: id,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#00a884', strokeWidth: 2 },
            });
        }

        // Edge from previous step
        if (index > 0) {
            const prevId = sorted[index - 1].id || `temp-${sorted[index - 1].tempId || (index - 1)}`;
            edges.push({
                id: `${prevId}-to-${id}`,
                source: prevId,
                target: id,
                type: 'smoothstep',
                style: { stroke: '#2a3942', strokeWidth: 2 },
            });
        }

        currentY += nodeStyle.gap + 80;
    });

    return { nodes, edges };
}

function getNodeType(stepType: string): string {
    switch (stepType) {
        case 'TEXT': return 'textNode';
        case 'IMAGE':
        case 'AUDIO':
        case 'VIDEO':
        case 'DOCUMENT': return 'mediaNode';
        case 'TOOL': return 'toolNode';
        case 'CONDITIONAL_TIME': return 'conditionalTimeNode';
        default: return 'textNode';
    }
}
