import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './tests',
  testMatch: 'offline.spec.ts',
  timeout: 90_000,
  workers: 1,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://127.0.0.1:3001',
    serviceWorkers: 'allow',
    headless: true,
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'offline-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'offline-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3001',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://calendar-test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'calendar-test-anon-key',
    },
  },
});
