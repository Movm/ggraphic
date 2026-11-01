// SPDX-License-Identifier: AGPL-3.0-only
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** The one-time token Studio prints at its first start, read the way docs/self-hosting.md says. */
function setupTokenFromLog(): string {
  const log = execFileSync('docker', ['compose', 'logs', '--no-log-prefix', 'studio'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const token = /setup token to create the admin account:\s+(\S+)/.exec(log)?.[1];
  if (!token) throw new Error('The log of the studio service has no setup token');
  return token;
}

test('first run: admin account, a project, a text and a PNG', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up ggraphic Studio' })).toBeVisible();
  await page.getByLabel('Setup token', { exact: true }).fill(setupTokenFromLog());
  await page.getByLabel('Email', { exact: true }).fill('admin@example.org');
  await page.getByLabel('Name', { exact: true }).fill('Admin');
  await page.getByLabel('Password', { exact: true }).fill('a long enough password');
  await page.getByRole('button', { name: 'Create the admin account' }).click();

  // A blank project, created on the server, opens in the editor.
  await page
    .getByRole('list', { name: 'Templates' })
    .getByRole('button', { name: /^Blank/ })
    .click();
  await expect(page).toHaveURL(/\/p\/[^/]+$/);
  await expect(page.locator('.konvajs-content canvas').first()).toBeVisible();

  await page.getByRole('button', { name: /^Text/ }).click();
  const textsOnCanvas = page.getByRole('button', { name: 'Remove text' });
  const before = await textsOnCanvas.count();
  await page.getByRole('button', { name: 'Add text field' }).click();
  await expect(textsOnCanvas).toHaveCount(before + 1);

  await page.getByRole('button', { name: 'Share' }).click();
  const share = page.getByRole('dialog');
  await share.getByRole('button', { name: 'Download' }).first().click();
  await expect(share.getByRole('combobox', { name: 'Format' })).toHaveText('PNG');
  const downloading = page.waitForEvent('download');
  await share.getByRole('button', { name: 'Download' }).last().click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^ggraphic.*\.png$/);
  const png = await readFile(await download.path());
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(png.length).toBeGreaterThan(1000);

  expect(errors).toEqual([]);
});
