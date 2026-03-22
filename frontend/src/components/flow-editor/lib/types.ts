import type { Node, Edge } from '@xyflow/react';

export interface Step {
    id?: string;
    tempId?: number;
    type: string;
    content: string;
    mediaUrl?: string;
    metadata?: any;
    delayMs: number;
    jitterPct: number;
    order: number;
    aiOnly?: boolean;
}

export interface Trigger {
    keyword: string;
    matchType: string;
    scope?: string;
    triggerType?: 'TEXT' | 'LABEL';
    labelName?: string;
    labelAction?: 'ADD' | 'REMOVE';
}

export interface Flow {
    id?: string;
    name: string;
    description: string;
    usageLimit: number;
    cooldownMs: number;
    excludesFlows: string[];
    triggers: Trigger[];
    steps: Step[];
    botId?: string;
    templateId?: string;
}

export interface StepNodeData {
    step: Step;
    index: number;
    selected?: boolean;
}

export interface TriggerNodeData {
    triggers: Trigger[];
}

export type StepNode = Node<StepNodeData>;
export type FlowEdge = Edge;
