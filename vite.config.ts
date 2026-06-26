import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:4344';
    return {
      // Build output goes to dist/ (served by backend Express in production)
      build: {
        outDir: 'dist',
        sourcemap: false,
        chunkSizeWarningLimit: 2000, // Monaco is large
        rollupOptions: {
          output: {
            // Split Monaco into its own chunk to avoid huge bundles
            manualChunks: {
              'monaco-editor': ['monaco-editor'],
              'react-vendor': ['react', 'react-dom'],
            },
          },
        },
      },
      server: {
        port: parseInt(env.VITE_PORT || '4343'),
        host: '0.0.0.0',
        // Dev-mode proxy — in production, Express handles /api and /socket.io directly
        proxy: {
          '/api': {
            target: backendUrl,
            changeOrigin: true,
          },
          '/socket.io': {
            target: backendUrl,
            changeOrigin: true,
            ws: true,
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
