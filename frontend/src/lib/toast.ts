/**
 * Lightweight toast notification system.
 * Works from both Alpine.js and React — no framework dependency.
 */

let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
    if (container && document.body.contains(container)) return container;

    container = document.createElement('div');
    container.id = 'toast-container';
    Object.assign(container.style, {
        position: 'fixed', bottom: '24px', right: '24px', zIndex: '9999',
        display: 'flex', flexDirection: 'column', gap: '8px',
        pointerEvents: 'none', maxWidth: '380px',
    });
    document.body.appendChild(container);
    return container;
}

function show(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3500) {
    const el = document.createElement('div');

    const colors = {
        success: { bg: '#00a884', border: '#00c49a', icon: '✓' },
        error: { bg: '#d13b3b', border: '#e54545', icon: '✗' },
        info: { bg: '#2a3942', border: '#3a4f5c', icon: 'ℹ' },
    };
    const c = colors[type];

    Object.assign(el.style, {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 16px', borderRadius: '10px',
        background: '#111b21', border: `1px solid ${c.border}`,
        color: '#e9edef', fontSize: '12px', fontFamily: 'ui-monospace, monospace',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        pointerEvents: 'auto', cursor: 'pointer',
        transform: 'translateX(120%)', transition: 'transform 0.25s ease, opacity 0.25s ease',
        opacity: '0',
    });

    el.innerHTML = `<span style="color:${c.bg};font-size:14px;flex-shrink:0">${c.icon}</span><span style="line-height:1.4">${escapeHtml(message)}</span>`;

    el.addEventListener('click', () => dismiss(el));

    getContainer().appendChild(el);

    // Trigger animation
    requestAnimationFrame(() => {
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
    });

    // Auto dismiss
    if (duration > 0) {
        setTimeout(() => dismiss(el), duration);
    }
}

function dismiss(el: HTMLElement) {
    el.style.transform = 'translateX(120%)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export const toast = {
    success: (msg: string, duration?: number) => show(msg, 'success', duration),
    error: (msg: string, duration?: number) => show(msg, 'error', duration ?? 5000),
    info: (msg: string, duration?: number) => show(msg, 'info', duration),
};

// Make globally accessible for Alpine pages
if (typeof window !== 'undefined') {
    (window as any).__toast = toast;
}

declare global {
    interface Window {
        __toast: typeof toast;
    }
}
