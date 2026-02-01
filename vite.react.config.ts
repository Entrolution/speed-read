import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      outDir: 'dist/types/react',
      include: ['src/react/**/*'],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/react/index.tsx'),
      name: 'SpeedReaderReact',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist/react',
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    sourcemap: true,
    minify: 'terser',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
