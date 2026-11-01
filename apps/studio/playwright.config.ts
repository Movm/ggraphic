// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from '@playwright/test';

const PORT = 4173;

/**
 * The render gate, stage 2: templates drawn in a real browser with the bundled OFL fonts.
 * Goldens are PNGs and depend on the browser's text rasteriser, so they are made and checked in
 * the official Playwright image only (see docs/self-hosting.md, "Render gate goldens").
 */
export default defineConfig({
  testDir: './e2e',
  // A golden has one name on every platform; the image is the only place it is made.
  snapshotPathTemplate: '{testDir}/__goldens__/{arg}{ext}',
  // One browser, one page at a time: the CI image and the local Docker VM are small. Tests are
  // still independent (`fullyParallel`), so CI can split them across runners with `--shard`.
  workers: 1,
  fullyParallel: true,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001 } },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 1400 },
    deviceScaleFactor: 1,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // compiled.html (e2e/compiledCss.spec.ts) loads the editor's built stylesheet.
    command: `pnpm --filter @ggraphic/editor build:css && pnpm exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/gate.html?list=1`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
