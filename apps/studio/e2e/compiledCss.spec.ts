// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `@ggraphic/editor/styles/compiled` in a page without Tailwind (`compiled.html`): the editor is
 * styled, the styles stay inside `[data-ggraphic]` (portals included), host rules win without
 * `!important`, and dark mode follows the tokens. No goldens: computed styles only.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const style = (page: Page, selector: string, prop: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/** What `background: var(<token>)` resolves to right now, as the browser serialises it. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.createElement('div');
    probe.style.background = `var(${t})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);

test.beforeEach(async ({ page }) => {
  await page.goto('/compiled.html');
  await expect(page.locator('.konvajs-content canvas').first()).toBeVisible({ timeout: 45_000 });
});

const COMPILED_CSS = path.resolve(
  import.meta.dirname,
  '../../../packages/editor/dist/styles/compiled.css'
);

test('the page has no stylesheet but the compiled one (and font faces)', async ({ page }) => {
  // The gate build (`--mode gate`, CSS unminified) names stylesheets after chunks, not sources, and
  // would merge foreign CSS into the same file: so compare the rules, not the file names.
  const { served, expected } = await page.evaluate(
    (source) => {
      const rules = (list: CSSRuleList) =>
        [...list].filter((rule) => !(rule instanceof CSSFontFaceRule)).map((rule) => rule.cssText);
      const reference = new CSSStyleSheet();
      reference.replaceSync(source);
      return {
        served: [...document.styleSheets].filter((s) => s.href).flatMap((s) => rules(s.cssRules)),
        expected: rules(reference.cssRules),
      };
    },
    readFileSync(COMPILED_CSS, 'utf8')
  );
  expect(expected.length).toBeGreaterThan(0);
  // A readable diff first; the full rules are hundreds of KB.
  expect(served.map((rule) => rule.slice(0, 80))).toEqual(
    expected.map((rule) => rule.slice(0, 80))
  );
  expect(served).toEqual(expected);
});

test('styles the editor layout and sidebar', async ({ page }) => {
  expect(await style(page, '.canvas-editor-layout', 'display')).toBe('flex');
  expect(await style(page, '.canvas-editor-layout', 'flex-direction')).toBe('column');
  expect(await style(page, '.canvas-editor-layout', 'background-color')).toBe(
    await tokenColour(page, '--editor-bg')
  );
  expect(await style(page, '.canvas-sidebar', 'position')).toBe('fixed');
  expect(await style(page, '.canvas-sidebar', 'z-index')).toBe('120');
  // The scoped reset: a sidebar tab button has no UA border or background.
  const tab = page.getByRole('button', { name: /^Text/ });
  await expect(tab).toBeVisible();
  expect(await tab.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('none');
});

test('leaves host markup outside the editor alone', async ({ page }) => {
  expect(await style(page, '#outside', 'display')).toBe('block');
  expect(await style(page, '#outside', 'padding-top')).toBe('0px');
  expect(await style(page, '#outside', 'background-color')).toBe('rgba(0, 0, 0, 0)');
  expect(await style(page, 'body', 'line-height')).toBe('normal');
});

test('lets an unlayered host rule win without !important', async ({ page }) => {
  // The editor's own utility says `min-h-[500px]`; compiled.html says 321px.
  expect(await style(page, '.canvas-editor-layout', 'min-height')).toBe('321px');
});

test('styles portalled UI outside the root', async ({ page }) => {
  await page.locator('.konvajs-content canvas').first().click({ button: 'right' });
  const menu = page.getByRole('menu').first();
  await expect(menu).toBeVisible();
  expect(await menu.getAttribute('data-ggraphic')).toBe('');
  expect(await menu.evaluate((el) => el.closest('[data-ggraphic]') === el)).toBe(true);
  expect(await menu.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).not.toBe('0px');
  expect(await menu.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    await tokenColour(page, '--editor-surface')
  );
});

test('follows dark mode through the tokens', async ({ page }) => {
  const light = await style(page, '.canvas-editor-layout', 'background-color');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const dark = await style(page, '.canvas-editor-layout', 'background-color');
  expect(dark).not.toBe(light);
  expect(dark).toBe(await tokenColour(page, '--editor-bg'));
});
