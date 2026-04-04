export function generateConnectionHtml(ctx: any): string {
    return `
        <div class="p-4" x-data="botConnection_${ctx.botId?.replace(/-/g, "_")}" x-init="init()">
            <div class="space-y-4">
                <div class="flex items-center gap-3">
                    <span class="w-3 h-3 rounded-full flex-shrink-0" :class="connected ? 'bg-green-500' : 'bg-gray-600'"></span>
                    <span class="text-sm font-sans" :class="connected ? 'text-green-400' : 'text-wa-text-secondary'" x-text="connected ? $t('active') : $t('disconnected')"></span>
                </div>
                <template x-if="qr && !connected">
                    <div class="bg-white p-4 w-fit max-w-full rounded-lg">
                        <img :src="qr" alt="QR Code" class="w-48 h-48 max-w-full max-h-full" />
                    </div>
                </template>
                <template x-if="!connected && !qr">
                    <button @click="connect()" :disabled="loading" class="w-full px-4 py-2 bg-wa-green text-white font-sans text-xs tracking-normal hover:bg-wa-green-hover transition-colors disabled:opacity-50 rounded-lg" x-text="loading ? $t('initializing') : $t('start_connection')"></button>
                </template>
                <template x-if="connected">
                    <button @click="disconnect()" :disabled="loading" class="w-full px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 font-sans text-xs tracking-normal hover:bg-red-500/30 transition-colors disabled:opacity-50 rounded-lg" x-text="loading ? $t('disconnecting') : $t('disconnect')"></button>
                </template>
            </div>
        </div>
    `;
}

export function generateConnectionHeaderHtml(ctx: any): string {
    const safeId = ctx.botId?.replace(/-/g, "_");
    return `
        <div x-data="botConnection_${safeId}" x-init="init()" class="flex items-center gap-2">
            <template x-if="connected">
                <button @click="disconnect()" :disabled="loading"
                    class="px-3 py-2 text-xs font-sans border border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors rounded-lg flex items-center gap-1.5"
                    x-text="loading ? $t('disconnecting') : $t('active')"></button>
            </template>
            <template x-if="!connected && !qr">
                <button @click="connect()" :disabled="loading"
                    class="px-3 py-2 text-xs font-sans border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors rounded-lg flex items-center gap-1.5"
                    x-text="loading ? $t('initializing') : $t('start_connection')"></button>
            </template>
            <template x-if="!connected && qr">
                <button @click="showQrModal = true"
                    class="px-3 py-2 text-xs font-sans border border-yellow-500/30 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors rounded-lg flex items-center gap-1.5 animate-pulse"
                    x-text="$t('scan_qr')"></button>
            </template>
        </div>
    `;
}

export function generateQrModalHtml(ctx: any): string {
    const safeId = ctx.botId?.replace(/-/g, "_");
    return `
        <div x-data="botConnection_${safeId}" x-init="init()">
            <template x-if="qr && !connected">
                <div class="inline-block bg-white p-4 rounded-xl">
                    <img :src="qr" alt="QR Code" class="w-56 h-56" />
                </div>
            </template>
            <template x-if="connected">
                <div class="py-4">
                    <div class="w-14 h-14 bg-green-500/20 text-green-400 rounded-xl flex items-center justify-center mx-auto mb-3 border border-green-500/50">
                        <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <p class="text-sm text-green-400 font-semibold">Conectado</p>
                </div>
            </template>
            <template x-if="!qr && !connected">
                <div class="py-4">
                    <p class="text-xs text-wa-text-secondary mb-3">Esperando código QR...</p>
                    <button @click="connect()" :disabled="loading"
                        class="px-6 py-2 bg-wa-green text-white text-xs rounded-lg hover:bg-wa-green-hover disabled:opacity-50 transition-colors"
                        x-text="loading ? 'Conectando...' : 'Iniciar conexión'"></button>
                </div>
            </template>
        </div>
    `;
}
