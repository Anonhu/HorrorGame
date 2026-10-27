import { defineConfig } from 'vite';

// Preview-friendly: bind to 0.0.0.0 and accept any proxied host/origin.
export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: false,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 3000 },
});
