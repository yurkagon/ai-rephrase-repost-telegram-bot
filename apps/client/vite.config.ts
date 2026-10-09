import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Ports live in the monorepo's root .env, next to the API's own config, so the
// dev proxy below always points at whatever port the API is actually using.
const ROOT_DIR = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, ROOT_DIR, '');
  // A real shell variable wins over the file, as it does everywhere else.
  const read = (name: string) => process.env[name] ?? rootEnv[name];

  const apiTarget = read('API_TARGET') ?? `http://localhost:${read('PORT') ?? 3000}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: Number(read('CLIENT_PORT') ?? 3001),
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
