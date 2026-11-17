// SPDX-License-Identifier: MIT
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('a design starts on the start page; the editor takes a text and exports a PNG', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Start page: a format, then a template. Both are links rendered on the server.
  await page.goto('/');
  await page.getByRole('link', { name: /^Post 4:5/ }).click();
  await expect(page.getByRole('link', { name: /^Post 4:5/ })).toHaveAttribute(
    'aria-current',
    'true'
  );
  await page.getByRole('link', { name: /^Quote/ }).click();

  // The editor opens the new design and stores it; a reload of /edit opens it again.
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.locator('[data-ggraphic] canvas').first()).toBeVisible();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('design') ?? 'null'));
  await expect
    .poll(stored)
    .toMatchObject({ formatId: 'post-portrait', pages: [{ configId: 'studio-quote' }] });

  // The header and the editor share the window: nothing scrolls (#155).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  );
  expect(overflow).toBe(0);

  // The compiled stylesheet stays inside [data-ggraphic]: the host's heading keeps its own font.
  const hostHeading = page.locator('h1.page-title');
  await expect(hostHeading).toHaveCSS('font-family', 'Georgia, serif');
  await expect(hostHeading).toHaveCSS('font-size', '20px');

  // Add a text; it reaches the host through onChange.
  await page.getByRole('button', { name: /^Text/ }).click();
  const textsOnCanvas = page.getByRole('button', { name: 'Remove text' });
  const storedTexts = () =>
    page.evaluate(() => (localStorage.getItem('design') ?? '').split('"text":').length - 1);
  const before = await textsOnCanvas.count();
  await page.getByRole('button', { name: 'Add text field' }).click();
  await expect(textsOnCanvas).toHaveCount(before + 1);
  await expect.poll(storedTexts).toBe(before + 1);

  // Export through the default service: a browser download.
  await page.getByRole('button', { name: 'Share' }).click();
  const share = page.getByRole('dialog');
  await share.getByRole('button', { name: 'Download' }).first().click();
  await expect(share.getByRole('combobox', { name: 'Format' })).toHaveText('PNG');
  const downloading = page.waitForEvent('download');
  await share.getByRole('button', { name: 'Download' }).last().click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const png = await readFile(await download.path());
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(png.length).toBeGreaterThan(1000);
  await page.keyboard.press('Escape');

  // "New design" leads back to the start page, which offers the stored design.
  await page.getByRole('link', { name: 'New design' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a format' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue your design' }).click();
  await expect(page.locator('[data-ggraphic] canvas').first()).toBeVisible();
  await page.getByRole('button', { name: /^Text/ }).click();
  await expect(textsOnCanvas).toHaveCount(before + 1);

  expect(errors).toEqual([]);
});
