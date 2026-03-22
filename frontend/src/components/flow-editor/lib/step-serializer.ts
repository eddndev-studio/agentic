import type { Node } from '@xyflow/react';
import type { Step, StepNodeData } from './types';

/**
 * Convert React Flow Node[] back to Step[] for API save.
 * Preserves positions in step.metadata.position.
 */
export function nodesToSteps(nodes: Node[]): Step[] {
    return nodes
        .filter(n => n.id !== 'trigger-node')
        .map((node, index) => {
            const data = node.data as unknown as StepNodeData;
            const step = { ...data.step };

            step.order = index;
            step.metadata = {
                ...step.metadata,
                position: { x: node.position.x, y: node.position.y },
            };

            return step;
        })
        .sort((a, b) => a.order - b.order);
}
