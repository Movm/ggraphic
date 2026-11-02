// SPDX-License-Identifier: MIT
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

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the page stays reachable above an open sheet', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-ggraphic] canvas').first()).toBeVisible();

    await page.getByRole('button', { name: /^Elements/ }).click();
    await expect(page.locator('.canvas-editor-layout__main[data-sheet-open]')).toBeVisible();

    // The stage bottom is either visible above the sheet or the canvas area scrolls down to it.
    const unreachable = () =>
      page.evaluate(() => {
        const main = document.querySelector('.canvas-editor-layout__main')!;
        const stage = document.querySelector('.konvajs-content')!.getBoundingClientRect();
        const below = stage.bottom - main.getBoundingClientRect().bottom;
        const scrolls = ['auto', 'scroll'].includes(getComputedStyle(main).overflowY);
        const scrollRoom = scrolls ? main.scrollHeight - main.clientHeight - main.scrollTop : 0;
        return Math.max(0, below - scrollRoom);
      });
    await expect.poll(unreachable).toBeLessThanOrEqual(1);
    // ...and the host page itself does not grow under the sheet.
    const pageOverflow = () =>
      page.evaluate(
        () => document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight
      );
    await expect.poll(pageOverflow).toBe(0);
  });
});

test('a narrow host box gets the mobile layout in a desktop window (#106)', async ({ page }) => {
  // The host gives the editor a phone-wide box; the window stays 1440 px wide.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.id = 'narrow-host';
      style.textContent = 'main.editor { width: 390px; }';
      document.head.append(style);
    });
  });
  await page.goto('/');
  await expect(page.locator('[data-ggraphic] canvas').first()).toBeVisible();

  await expect(page.locator('.canvas-editor-layout__bottom-bar')).toHaveCount(0);

  // The stage fits into the box, not into the window.
  const fit = () =>
    page.evaluate(() => {
      const host = document.querySelector('main.editor')!.getBoundingClientRect();
      const stage = document.querySelector('.konvajs-content')!.getBoundingClientRect();
      return stage.width > 0 && stage.left >= host.left && stage.right <= host.right;
    });
  await expect.poll(fit).toBe(true);
  const layout = page.locator('.canvas-editor-layout');
  await expect(layout).toHaveAttribute('data-canvas-mobile', '');

  // Same window, wider box: back to the desktop layout.
  await page.evaluate(() => document.getElementById('narrow-host')!.remove());
  await expect(layout).not.toHaveAttribute('data-canvas-mobile');
  await expect(page.locator('.canvas-editor-layout__bottom-bar')).toBeVisible();
});
