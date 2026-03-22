// @ts-check
import { defineConfig } from 'astro/config';
import alpine from '@astrojs/alpinejs';
import react from '@astrojs/react';
import tailwind from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
    integrations: [alpine(), react()],
    vite: {
        plugins: [tailwind()],
    },
});
