// SPDX-License-Identifier: MPL-2.0
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('the embedded editor mounts, takes a text and exports a PNG', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('[data-ggraphic] canvas').first()).toBeVisible();

  // The compiled stylesheet stays inside [data-ggraphic]: the host's heading keeps its own font.
  const hostHeading = page.locator('.host-bar h1');
  await expect(hostHeading).toHaveCSS('font-family', 'Georgia, serif');
  await expect(hostHeading).toHaveCSS('font-size', '20px');

  // The editor fills exactly the host's box below the host bar, chrome included (#100).
  const box = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const host = rect('main.editor');
    const inHost = (r: DOMRect) => r.top >= host.top && r.bottom <= host.bottom;
    return {
      barBottom: rect('.host-bar').bottom,
      host: [host.top, host.bottom],
      editor: [rect('.canvas-editor-layout').top, rect('.canvas-editor-layout').bottom],
      sidebarInHost: inHost(rect('.canvas-sidebar')),
      bottomBarInHost: inHost(rect('.canvas-editor-layout__bottom-bar')),
    };
  });
  expect(box.host[0]).toBe(box.barBottom);
  expect(box.editor).toEqual(box.host);
  expect(box.sidebarInHost).toBe(true);
  expect(box.bottomBarInHost).toBe(true);

  // Add a text; it reaches the host through onChange. The panel's first button must not sit under
  // the editor's top bar, so this click goes through without force.
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

  expect(errors).toEqual([]);
});
