import React, { type RefObject } from 'react';
import { useMonitor } from '../MonitorProvider';

interface Props {
    fileInputRef: RefObject<HTMLInputElement | null>;
}

export function AttachmentPreview({ fileInputRef }: Props) {
    const { state, removeAttachment, clearAttachments } = useMonitor();
    const { attachments, uploadingFile } = state;

    if (attachments.length === 0 && !uploadingFile) return null;

    return (
        <div className="bg-wa-bg-header px-2 sm:px-4 pt-2 pb-1 flex-shrink-0 border-t border-wa-border">
            <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] text-wa-text-secondary">{attachments.length} archivo(s)</span>
                {uploadingFile && (
                    <div className="w-3 h-3 border-2 border-wa-green/30 border-t-wa-green rounded-full animate-spin ml-1" />
                )}
                <button onClick={clearAttachments} className="ml-auto text-[10px] text-red-400 hover:text-red-300 transition-colors">
                    Quitar todo
                </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
                {attachments.map((att, i) => (
                    <div key={i} className="relative flex-shrink-0 group/att">
                        {att.preview ? (
                            <img src={att.preview} className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-wa-border" />
                        ) : (
                            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-wa-bg-hover rounded-lg border border-wa-border flex flex-col items-center justify-center gap-1">
                                <svg className="w-5 h-5 text-wa-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-[8px] text-wa-text-secondary truncate max-w-[56px] sm:max-w-[72px] px-1">{att.file.name}</span>
                            </div>
                        )}
                        <button
                            onClick={() => removeAttachment(i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity shadow"
                            style={{ fontSize: 10 }}
                        >
                            ×
                        </button>
                        <span className="absolute bottom-1 left-1 text-[8px] bg-black/60 text-white px-1 rounded">{att.mediaType}</span>
                    </div>
                ))}
                {/* Add more button */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 border-2 border-dashed border-wa-border rounded-lg flex items-center justify-center text-wa-text-secondary hover:border-wa-green hover:text-wa-green transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
