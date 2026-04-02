import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseStepNode } from './BaseStepNode';
import type { StepNodeData } from '../lib/types';

const mediaIcons: Record<string, React.ReactNode> = {
    IMAGE: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>,
    VIDEO: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>,
    AUDIO: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
    DOCUMENT: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
};

const mediaColors: Record<string, string> = {
    IMAGE: '#53bdeb',
    VIDEO: '#ff9a00',
    AUDIO: '#5bc5d1',
    DOCUMENT: '#e8b830',
};

const isVariableRef = (value: string | undefined | null): boolean =>
    !!value && /^\{\{\w+\}\}$/.test(value.trim());

export function MediaNode({ data, selected }: NodeProps) {
    const nodeData = data as unknown as StepNodeData;
    const { step } = nodeData;
    const color = mediaColors[step.type] || '#53bdeb';
    const mediaUrlIsVariable = isVariableRef(step.mediaUrl);

    return (
        <BaseStepNode data={nodeData} selected={selected} typeLabel={step.type} typeColor={color} icon={mediaIcons[step.type]}>
            {step.mediaUrl ? (
                <div>
                    {mediaUrlIsVariable ? (
                        <div style={{
                            display: 'inline-block', padding: '2px 6px', marginBottom: 4,
                            background: '#7f66ff20', color: '#a78bfa', borderRadius: 4,
                            fontSize: 9, fontFamily: 'ui-monospace, monospace',
                        }}>
                            {step.mediaUrl.replace(/[{}]/g, '')}
                        </div>
                    ) : (
                        <>
                            {step.type === 'IMAGE' && (
                                <img src={step.mediaUrl} alt="" style={{
                                    width: '100%', height: 48, objectFit: 'cover', borderRadius: 6,
                                    opacity: 0.7, marginBottom: 4,
                                }} />
                            )}
                            <div style={{ color: '#8696a0', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {step.mediaUrl.split('/').pop()}
                            </div>
                        </>
                    )}
                    {step.content && (
                        <div style={{ color: '#e9edef', marginTop: 4, fontSize: 10 }}>
                            {step.content.length > 40 ? step.content.slice(0, 40) + '...' : step.content}
                        </div>
                    )}
                </div>
            ) : (
                <span style={{ color: '#8696a0', fontStyle: 'italic' }}>No media</span>
            )}
        </BaseStepNode>
    );
}
