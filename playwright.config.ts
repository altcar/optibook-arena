import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:8790',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: process.env.CI ? undefined : 'msedge',
  },
  webServer: {
    command: 'npm run build && npx wrangler dev --port 8790 --ip 127.0.0.1',
    url: 'http://127.0.0.1:8790/api/health',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
