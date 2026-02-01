import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

function serveSamples() {
  const samplesDir = resolve(__dirname, 'samples');
  return {
    name: 'serve-samples',
    configureServer(server: any) {
      server.middlewares.use('/samples', (req: any, res: any, next: any) => {
        const filePath = resolve(samplesDir, req.url.slice(1));
        if (existsSync(filePath)) {
          res.end(readFileSync(filePath));
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  root: 'demo',
  server: {
    fs: {
      allow: ['..'],
    },
  },
  plugins: [serveSamples()],
  resolve: {
    alias: {
      'speed-read': resolve(__dirname, 'src/index.ts'),
      '@': resolve(__dirname, 'src'),
    },
  },
});
