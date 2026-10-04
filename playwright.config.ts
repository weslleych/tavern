import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // All browser contexts share one IP and the server's 40 requests/minute allowance.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3100/api/health',
    timeout: 120000,
    env: {
      PORT: '3100',
      HOSTNAME: '127.0.0.1',
      TAVERN_DATA_FILE: '.tavern/e2e.json',
      MONGODB_URI: '',
    },
    reuseExistingServer: !process.env.CI,
  },
});
