import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The sales CRM: its own page, built next to the 3D site (dist/crm/ -> .../khocha-sokhtmon/crm/).
// It reads the flats from the site's model files (../src), so the numbers and plans are the same.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: false,
  server: { port: 5194, fs: { allow: ['..'] } },
  preview: { port: 5195 },
  build: {
    outDir: '../dist/crm',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: { entryFileNames: 'assets/crm.js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' },
    },
  },
});
