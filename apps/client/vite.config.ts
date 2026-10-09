import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Ports live in the monorepo's root .env, next to the API's own config, so the
// dev proxy below always points at whatever port the API is actually using.
const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

if (existsSync(ENV_FILE)) loadEnvFile(ENV_FILE);

const apiTarget = process.env.API_TARGET ?? `http://localhost:${process.env.PORT ?? 3000}`;

export default defineConfig({
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.CLIENT_PORT ?? 3001),
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
});
