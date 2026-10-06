// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  site: 'https://e-invoice.nalaro.web.id',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
