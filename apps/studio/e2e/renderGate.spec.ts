// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Render gate, stage 2: every template of the open pack on every test brand, offered colour
 * world and declared format is drawn in Chromium with the bundled OFL fonts, and no slot text
 * may overflow (`gate.html` measures with the editor's own text layout). On the default brand
 * the drawn page is also held against a golden.
 *
 * Run it in the Playwright image (`scripts/gate-render-docker.sh`), never on the host: the
 * goldens depend on the rasteriser.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { GateResult } from '../src/gate/result';

const STUDIO_DIR = path.resolve(import.meta.dirname, '..');
const PACK_DIR = path.resolve(STUDIO_DIR, '../../packages/templates-open/src/templates');
const TEST_BRANDS = path.resolve(STUDIO_DIR, '../../packages/templates-open/test/test-brands.json');

/** The Studio format each template aspect is drawn on. */
const FORMAT_OF_ASPECT: Readonly<Record<string, string>> = {
  '1:1': 'profile-square',
  '4:5': 'post-portrait',
  '16:9': 'slide-16-9',
};

interface PackTemplate {
  id: string;
  kind: string;
  formats: string[];
}

const templates: PackTemplate[] = readdirSync(PACK_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(path.join(PACK_DIR, file), 'utf8')) as PackTemplate)
  .filter((t) => t.kind === 'template')
  .sort((a, b) => a.id.localeCompare(b.id));

const brands: string[] = [
  'default',
  ...(JSON.parse(readFileSync(TEST_BRANDS, 'utf8')) as { brands: { id: string }[] }).brands.map(
    (b) => `test-${b.id}`
  ),
];

async function open(page: Page, params: Record<string, string>): Promise<GateResult> {
  await page.goto(`/gate.html?${new URLSearchParams(params)}`);
  await page.waitForFunction(() => window.__gate?.ready === true, undefined, { timeout: 45_000 });
  return page.evaluate(() => window.__gate!);
}

test('the gate covers the templates and brands this spec loops over', async ({ page }) => {
  const gate = await open(page, { list: '1' });
  expect(gate.templates?.map((t) => t.id).sort()).toEqual(templates.map((t) => t.id));
  expect(gate.brands).toEqual(brands);
});

// The red probe: a placeholder of three times the slot's maxChars must be reported, or the
// gate would pass for the wrong reason.
test('red probe: an over-long placeholder overflows its slot', async ({ page }) => {
  const clean = await open(page, {
    template: 'studio-quote',
    scheme: 'light',
    brand: 'default',
    format: 'post-portrait',
  });
  expect(clean.error).toBeNull();
  expect(clean.overflow).toEqual([]);

  const probed = await open(page, {
    template: 'studio-quote',
    scheme: 'light',
    brand: 'default',
    format: 'post-portrait',
    probe: 'overflow',
  });
  expect(probed.error).toBeNull();
  expect(probed.overflow.map((o) => o.elementId)).toContain('headline');
  for (const o of probed.overflow) {
    if (o.maxLines !== null) expect(o.lines).toBeGreaterThan(o.maxLines);
  }
});

test('gate.html is not part of the production build', async () => {
  test.setTimeout(300_000);
  const out = mkdtempSync(path.join(tmpdir(), 'studio-build-'));
  try {
    // A plain `vite build`, except that workspace packages resolve to their source (the
    // `development` condition): the job has not built their dist, and the input is what is checked.
    const script = `
      import { build } from 'vite';
      await build({
        configFile: ${JSON.stringify(path.join(STUDIO_DIR, 'vite.config.ts'))},
        logLevel: 'error',
        resolve: { conditions: ['module', 'browser', 'development'] },
        build: { outDir: ${JSON.stringify(out)}, emptyOutDir: true },
      });
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: STUDIO_DIR,
      stdio: 'pipe',
    });
    const files = (readdirSync(out, { recursive: true }) as string[]).filter((f) =>
      /\.(html|js|css)$/.test(f)
    );
    expect(existsSync(path.join(out, 'index.html'))).toBe(true);
    expect(files.filter((f) => path.basename(f) === 'gate.html')).toEqual([]);
    // Nor its script: the page's marker must be in no emitted file.
    const leaked = files.filter((f) => readFileSync(path.join(out, f), 'utf8').includes('__gate'));
    expect(leaked).toEqual([]);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

for (const template of templates) {
  for (const brand of brands) {
    for (const aspect of template.formats) {
      const format = FORMAT_OF_ASPECT[aspect];
      test(`${template.id} on ${brand}, ${aspect}: no slot overflows`, async ({ page }) => {
        expect(format, `no Studio format for aspect ${aspect}`).toBeDefined();
        const offered = await open(page, { template: template.id, brand, format: format! });
        expect(offered.error).toBeNull();
        expect(offered.schemes?.length ?? 0).toBeGreaterThan(0);
        for (const scheme of offered.schemes ?? []) {
          const gate = await open(page, { template: template.id, scheme, brand, format: format! });
          expect(gate.error, `${scheme}`).toBeNull();
          expect(gate.overflow, `world ${scheme}`).toEqual([]);
          if (brand === 'default') {
            await expect(page.getByTestId('stage')).toHaveScreenshot(
              `${template.id}-${scheme}-${format!}.png`
            );
          }
        }
      });
    }
  }
}
