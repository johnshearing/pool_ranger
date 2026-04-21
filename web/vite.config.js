import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [nodePolyfills()],
  build: {
    rollupOptions: { input: 'sign_tx.html' },
    commonjsOptions: { transformMixedEsModules: true },
  },
});
