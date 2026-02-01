import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync } from 'fs';

function copySamples() {
  return {
    name: 'copy-samples',
    closeBundle() {
      const samplesDir = resolve(__dirname, 'samples');
      const outDir = resolve(__dirname, 'docs-dist/samples');
      mkdirSync(outDir, { recursive: true });
      for (const file of readdirSync(samplesDir)) {
        if (!file.endsWith('.md')) {
          copyFileSync(resolve(samplesDir, file), resolve(outDir, file));
        }
      }
    },
  };
}

export default defineConfig({
  root: 'demo',
  base: '/speed-read/',
  build: {
    outDir: '../docs-dist',
    emptyOutDir: true,
  },
  plugins: [copySamples()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'speed-read': resolve(__dirname, 'src/index.ts'),
    },
  },
});
