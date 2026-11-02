// SPDX-License-Identifier: MIT
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  // The production build, as a host would ship it.
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
