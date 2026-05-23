import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [nodePolyfills()],
  build: {
    rollupOptions: {
      input: {
        sign_tx: 'sign_tx.html',
        send_from_staking: 'send_from_staking.html',
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      strictRequires: true,
    },
  },
});
