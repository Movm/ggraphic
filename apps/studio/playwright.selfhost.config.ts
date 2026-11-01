// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig, devices } from '@playwright/test';

/**
 * The image's first run as a self-hoster sees it, against a running `docker compose up`
 * (studio-image.yml). The test needs a fresh instance: it creates the admin account with the
 * setup token, which it reads with `docker compose logs`. Locally, next to an instance you keep,
 * give the test stack its own project and port, for example from the repository root:
 *   export COMPOSE_PROJECT_NAME=ggraphic-smoke STUDIO_PORT=8090 STUDIO_URL=http://localhost:8090
 *   docker compose up -d --wait
 *   pnpm --filter @ggraphic/studio exec playwright test -c playwright.selfhost.config.ts
 *   docker compose down -v
 */
export default defineConfig({
  testDir: './e2e-selfhost',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: process.env['STUDIO_URL'] ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
