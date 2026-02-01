import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'demo',
  base: '/speed-read/',
  build: {
    outDir: '../docs-dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'speed-read': resolve(__dirname, 'src/index.ts'),
    },
  },
});
