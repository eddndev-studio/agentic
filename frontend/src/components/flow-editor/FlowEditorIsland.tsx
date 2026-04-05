import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowEditorProvider } from './FlowEditorProvider';
import { EditorShell } from './EditorShell';

export default function FlowEditorIsland() {
    return (
        <ReactFlowProvider>
            <FlowEditorProvider>
                <EditorShell />
            </FlowEditorProvider>
        </ReactFlowProvider>
    );
}
