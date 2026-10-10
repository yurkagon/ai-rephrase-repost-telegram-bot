import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:3007', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter api exec ts-node -r tsconfig-paths/register test/browser-server.ts',
      cwd: '../..',
      url: 'http://127.0.0.1:3088/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 3007',
      url: 'http://127.0.0.1:3007',
      reuseExistingServer: !process.env.CI,
      env: { API_TARGET: 'http://127.0.0.1:3088', CLIENT_PORT: '3007' },
      timeout: 120000,
    },
  ],
});
