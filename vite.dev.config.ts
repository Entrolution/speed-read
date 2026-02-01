import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

function serveSamples() {
  const samplesDir = resolve(__dirname, 'samples');
  const mimeTypes: Record<string, string> = {
    '.epub': 'application/epub+zip',
    '.pdf': 'application/pdf',
    '.cbz': 'application/vnd.comicbook+zip',
  };
  return {
    name: 'serve-samples',
    configureServer(server: any) {
      server.middlewares.use('/samples', (req: any, res: any, next: any) => {
        // Strip query parameters from URL
        const urlPath = req.url.split('?')[0].slice(1);
        const filePath = resolve(samplesDir, urlPath);
        if (existsSync(filePath)) {
          // Set correct content type based on extension
          const ext = urlPath.substring(urlPath.lastIndexOf('.'));
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          res.setHeader('Content-Type', contentType);
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
