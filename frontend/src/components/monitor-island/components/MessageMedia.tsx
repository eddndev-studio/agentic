import React from 'react';
import type { Message } from '../types';

interface Props {
    msg: Message;
    mediaUrl: string | null;
}

export function MessageMedia({ msg, mediaUrl }: Props) {
    if (msg.type === 'IMAGE' && mediaUrl) {
        return (
            <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="block">
                <img src={mediaUrl} className="w-full max-h-72 object-cover" loading="lazy" alt=""
                    onError={e => { (e.target as HTMLImageElement).outerHTML = '<div class="flex items-center justify-center h-24 text-wa-text-secondary text-xs">Imagen no disponible</div>'; }} />
            </a>
        );
    }

    if (msg.type === 'VIDEO' && mediaUrl) {
        return <video src={mediaUrl} controls preload="metadata" className="w-full max-h-72" />;
    }

    if (msg.type === 'AUDIO' && mediaUrl) {
        return (
            <div className="px-2.5 pt-2 min-w-[180px] sm:min-w-[240px]">
                <audio src={mediaUrl} controls preload="metadata" className="w-full h-10" />
            </div>
        );
    }

    if (msg.type === 'DOCUMENT' && mediaUrl) {
        return (
            <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-white/5 rounded-lg p-3 mx-1 mt-1 mb-1 hover:bg-white/10 transition-colors">
                <svg className="w-8 h-8 text-wa-text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="min-w-0">
                    <span className="text-xs text-blue-300 block truncate">Documento</span>
                    <span className="text-[10px] text-wa-text-secondary">Toca para abrir</span>
                </div>
            </a>
        );
    }

    if (msg.type === 'STICKER' && mediaUrl) {
        return (
            <img src={mediaUrl} className="w-36 h-36 sm:w-40 sm:h-40 object-contain p-1" loading="lazy" alt="Sticker"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        );
    }

    if (msg.type === 'PTT' && mediaUrl) {
        return (
            <div className="px-2.5 pt-2 min-w-[180px] sm:min-w-[240px] flex items-center gap-2">
                <svg className="w-5 h-5 text-wa-green flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zM11 19.93V22h2v-2.07A8 8 0 0020 12h-2a6 6 0 01-12 0H4a8 8 0 007 7.93z" />
                </svg>
                <audio src={mediaUrl} controls preload="metadata" className="w-full h-10" />
            </div>
        );
    }

    if (msg.type === 'CONTACT') {
        return (
            <div className="flex items-center gap-2 bg-white/5 rounded-lg p-3 mx-1 mt-1 mb-1">
                <svg className="w-8 h-8 text-wa-text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                </svg>
                <span className="text-xs">{msg.content || 'Contacto'}</span>
            </div>
        );
    }

    if (msg.type === 'LOCATION') {
        const lat = msg.metadata?.latitude ?? 0;
        const lng = msg.metadata?.longitude ?? 0;
        return (
            <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white/5 rounded-lg p-3 mx-1 mt-1 mb-1 hover:bg-white/10 transition-colors">
                <svg className="w-8 h-8 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                <div className="min-w-0">
                    <span className="text-xs text-blue-300 block truncate">{msg.content || 'Ubicación'}</span>
                    <span className="text-[10px] text-wa-text-secondary">Toca para abrir en Maps</span>
                </div>
            </a>
        );
    }

    if (msg.type === 'POLL') {
        return (
            <div className="bg-white/5 rounded-lg p-3 mx-1 mt-1 mb-1">
                <div className="flex items-center gap-1.5 mb-2">
                    <svg className="w-4 h-4 text-wa-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zm0-8v2h14V9H7z" />
                    </svg>
                    <span className="text-xs font-medium">{msg.content || 'Encuesta'}</span>
                </div>
                {msg.metadata?.options && (
                    <div className="flex flex-col gap-1">
                        {msg.metadata.options.map((opt, i) => (
                            <span key={i} className="text-[10px] text-wa-text-secondary bg-white/5 rounded px-2 py-1">{opt}</span>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Media fallback for missing URLs
    if (!mediaUrl && ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'PTT'].includes(msg.type)) {
        return (
            <div className="flex items-center gap-2 px-2.5 py-2 text-wa-text-secondary">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span className="text-xs italic">[{msg.type.toLowerCase()}]</span>
            </div>
        );
    }

    return null;
}
