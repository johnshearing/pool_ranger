import { defineConfig } from 'vite';
export default defineConfig({
  build: { rollupOptions: { input: 'sign_tx.html' } },
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  resolve: {
    alias: {
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      events: 'events',
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    esbuildOptions: { define: { global: 'globalThis' } },
  },
});
