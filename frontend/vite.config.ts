import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultServer } from './src/webview/server';
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export default defineConfig(({ mode }) => {
  // Reject invalid compiled defaults before serving or bundling, so a bad
  // .env.local produces an actionable tool error instead of a blank client.
  try { defaultServer(loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_').VITE_API_BASE_URL); }
  catch (error) { throw new Error(`Invalid VITE_API_BASE_URL: ${error instanceof Error ? error.message : String(error)}`); }
  return {
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  resolve: { preserveSymlinks: true, alias: { '#default-font/svg/default.js': '@mathjax/mathjax-tex-font/js/svg/default.js' } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/.secrets/**', '**/releases/**', '**/.cache/**', '**/test-results/**', '**/examples/**'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1800 },
  };
});

