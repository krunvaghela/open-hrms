import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    actionTimeout: 15000,
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3100',
    headless: true,
    viewport: { width: 1440, height: 1100 },
    trace: 'retain-on-failure',
  },
  reporter: 'list',
});
