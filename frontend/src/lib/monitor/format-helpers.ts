import { getLabelColor } from '../label-colors';

export function avatarInitials(name: string): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

export function avatarColor(name: string): string {
    const colors = ['#7c3aed','#2563eb','#0891b2','#059669','#d97706','#dc2626','#db2777','#9333ea','#4f46e5','#0d9488','#ca8a04','#e11d48','#6366f1','#14b8a6','#f59e0b'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

export function dateLabel(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today.getTime() - msgDay.getTime()) / 86400000;
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Ayer";
    return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function showDateSep(msgs: any[], i: number): boolean {
    if (i === 0) return true;
    const prev = new Date(msgs[i - 1].createdAt);
    const curr = new Date(msgs[i].createdAt);
    return prev.getFullYear() !== curr.getFullYear() || prev.getMonth() !== curr.getMonth() || prev.getDate() !== curr.getDate();
}

export function isLastInGroup(msgs: any[], i: number): boolean {
    if (i === msgs.length - 1) return true;
    return msgs[i].fromMe !== msgs[i + 1].fromMe;
}

export function shortTime(dateStr: string): string {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function relativeTime(dateStr: string, _tick?: number): string {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

export function formatTime(dateStr: string): string {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleString();
}

export function formatMessage(text: string): string {
    if (!text) return '';
    let s = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/```([\s\S]*?)```/g, '<code class="bg-white/10 px-1 py-0.5 rounded text-xs font-mono">$1</code>');
    s = s.replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, '<strong>$1</strong>');
    s = s.replace(/(?<!\w)_([^\s_](?:[^_]*[^\s_])?)_(?!\w)/g, '<em>$1</em>');
    s = s.replace(/~([^\s~](?:[^~]*[^\s~])?)~/g, '<del>$1</del>');
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-blue-300 hover:underline break-all">$1</a>');
    return s;
}

export function detectMediaType(file: File): string {
    const t = file.type;
    if (t.startsWith('image/')) return 'IMAGE';
    if (t.startsWith('video/')) return 'VIDEO';
    if (t.startsWith('audio/')) return 'AUDIO';
    return 'DOCUMENT';
}

export function getMediaUrl(msg: any): string | null {
    const url = msg.metadata?.mediaUrl;
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const filename = url.split('/').pop();
    const base = (import.meta as any).env?.PUBLIC_API_URL || ((import.meta as any).env?.DEV ? 'http://localhost:8080' : 'https://agentic-api.w-gateway.cc');
    return `${base}/upload/files/${filename}`;
}

// Re-export for convenience
export { getLabelColor as labelColor } from '../label-colors';

export function playNotifSound() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } catch {}
}

/**
 * Build a map of externalId → emoji[] from REACTION messages.
 * Handles both Baileys (metadata.reactedTo.id) and WABA (metadata.reactionTargetId).
 * Keeps only the latest reaction per sender. Empty content = removal.
 */
export function buildReactionsMap(messages: any[]): Record<string, string[]> {
    const senderMap: Record<string, Record<string, string | null>> = {};

    for (const msg of messages) {
        if (msg.type !== 'REACTION') continue;
        const targetId = msg.metadata?.reactedTo?.id || msg.metadata?.reactionTargetId;
        if (!targetId) continue;

        const sender = msg.sender || (msg.fromMe ? '__me__' : '__unknown__');
        if (!senderMap[targetId]) senderMap[targetId] = {};
        senderMap[targetId][sender] = msg.content || null;
    }

    const result: Record<string, string[]> = {};
    for (const [targetId, senders] of Object.entries(senderMap)) {
        const emojis = Object.values(senders).filter((e): e is string => !!e);
        if (emojis.length > 0) result[targetId] = emojis;
    }
    return result;
}
