// @ts-check
import { defineConfig } from 'astro/config';
import alpine from '@astrojs/alpinejs';
import react from '@astrojs/react';
import tailwind from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

// https://astro.build/config
export default defineConfig({
    integrations: [
        alpine(),
        react(),
        AstroPWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
            manifest: {
                name: 'Agentic - Bot Orchestrator',
                short_name: 'Agentic',
                description: 'WhatsApp Bot Orchestrator',
                theme_color: '#0b141a',
                background_color: '#0b141a',
                display: 'standalone',
                scope: '/',
                start_url: '/',
                icons: [
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{css,js,html,svg,png,ico,woff,woff2}'],
                navigateFallback: '/offline',
                navigateFallbackDenylist: [/^\/api/],
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) =>
                            url.origin === 'https://agentic-api.w-gateway.cc' ||
                            url.origin === 'http://localhost:8080',
                        handler: 'NetworkOnly',
                    },
                ],
            },
            devOptions: { enabled: false },
        }),
    ],
    vite: {
        plugins: [tailwind()],
    },
});
