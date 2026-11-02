// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The stage fills the canvas area on desktop and follows it in both directions (#112): it is as
 * large as the area allows, nothing covers it, and after the window shrinks and grows back it is
 * as large as at the start. Runs on `compiled.html`, a full-window editor. No goldens: element
 * sizes only.
 */
import { expect, test, type Page } from '@playwright/test';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Every stage, and the part of the canvas area nothing covers: below the context bar slot, above the bottom bar. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      const round = (n: number) => Math.round(n);
      return {
        left: round(r.left),
        top: round(r.top),
        right: round(r.right),
        bottom: round(r.bottom),
        width: round(r.width),
        height: round(r.height),
      };
    };
    const main = document.querySelector('.canvas-editor-layout__main')!;
    const slot = main.firstElementChild!;
    const bar = document.querySelector('.canvas-editor-layout__bottom-bar');
    const m = box(main);
    return {
      stages: [...document.querySelectorAll('.canvas-stage-container')].map(box),
      visible: {
        left: m.left,
        right: m.right,
        // The context bar slot has no layout box on mobile.
        top: slot.getClientRects().length > 0 ? box(slot).bottom : m.top,
        // The bottom bar is hidden on mobile (no layout box); the tab bar sits below the main column.
        bottom: Math.min(
          bar && bar.getClientRects().length > 0 ? box(bar).top : m.bottom,
          window.innerHeight
        ),
      },
    };
  });

/**
 * Resizes the window and returns the measurement once the first stage has kept its size for three
 * polls in a row: the fit arrives a frame or two after the layout, through a ResizeObserver.
 */
async function resizeTo(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  let last = await measure(page);
  let steady = 0;
  await expect
    .poll(
      async () => {
        const now = await measure(page);
        const [a, b] = [now.stages[0]!, last.stages[0]!];
        steady = a.width === b.width && a.height === b.height ? steady + 1 : 0;
        last = now;
        return steady;
      },
      { intervals: [250] }
    )
    .toBeGreaterThanOrEqual(3);
  return last;
}

const sizeOf = (s: Box) => ({ width: s.width, height: s.height });

async function open(page: Page, query = '') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/compiled.html${query}`);
  await expect(page.locator('.konvajs-content canvas').first()).toBeVisible({ timeout: 45_000 });
}

test.describe('regrows after the window shrank', () => {
  test.beforeEach(({ page }) => open(page));

  test('across the mobile breakpoint (1440 → 390 → 1440)', async ({ page }) => {
    const start = sizeOf((await resizeTo(page, 1440, 900)).stages[0]!);
    const phone = sizeOf((await resizeTo(page, 390, 844)).stages[0]!);
    expect(phone.width).toBeLessThan(start.width);
    expect(sizeOf((await resizeTo(page, 1440, 900)).stages[0]!)).toEqual(start);
  });

  test('without the breakpoint, narrower (1440 → 1000 → 1440)', async ({ page }) => {
    const start = sizeOf((await resizeTo(page, 1440, 900)).stages[0]!);
    await resizeTo(page, 1000, 900);
    expect(sizeOf((await resizeTo(page, 1440, 900)).stages[0]!)).toEqual(start);
  });

  test('without the breakpoint, lower (900 → 500 → 900 high)', async ({ page }) => {
    const start = sizeOf((await resizeTo(page, 1440, 900)).stages[0]!);
    const low = sizeOf((await resizeTo(page, 1440, 500)).stages[0]!);
    expect(low.height).toBeLessThan(start.height);
    expect(sizeOf((await resizeTo(page, 1440, 900)).stages[0]!)).toEqual(start);
  });
});

for (const format of ['post-portrait', 'slide-16-9']) {
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
    [1024, 768],
  ] as const) {
    test(`${format} at ${width}×${height}: fills the canvas area, nothing covers it`, async ({
      page,
    }) => {
      await open(page, `?format=${format}`);
      const { stages, visible } = await resizeTo(page, width, height);
      const stage = stages[0]!;
      expect(stage.left).toBeGreaterThanOrEqual(visible.left);
      expect(stage.right).toBeLessThanOrEqual(visible.right);
      expect(stage.top).toBeGreaterThanOrEqual(visible.top);
      expect(stage.bottom).toBeLessThanOrEqual(visible.bottom);
      // Fills: one side reaches close to the area (page toolbar and gaps aside).
      const spareWidth = visible.right - visible.left - stage.width;
      const spareHeight = visible.bottom - visible.top - stage.height;
      expect(Math.min(spareWidth, spareHeight)).toBeLessThan(120);
    });
  }
}

test.describe('mobile', () => {
  test.beforeEach(({ page }) => open(page));

  test('a page limited by the height stays above the tab bar (#139)', async ({ page }) => {
    // 500 × 701: a portrait page as wide as the box rule allows would be taller than the area.
    const { stages, visible } = await resizeTo(page, 500, 701);
    const stage = stages[0]!;
    expect(stage.top).toBeGreaterThanOrEqual(visible.top);
    expect(stage.bottom).toBeLessThanOrEqual(visible.bottom);
    expect(visible.bottom - visible.top - stage.height).toBeLessThan(120);
  });

  test('a page limited by the width keeps the width of the box rule', async ({ page }) => {
    const { stages } = await resizeTo(page, 390, 844);
    // `getOptimalContainerWidth`: the box minus 32 px.
    expect(stages[0]!.width).toBe(390 - 32);
  });
});

test('a multi-page document: every page the same full size, each reachable whole by scrolling', async ({
  page,
}) => {
  await open(page, '?pages=2');
  const { stages, visible } = await resizeTo(page, 1440, 900);
  expect(stages).toHaveLength(2);
  expect(sizeOf(stages[1]!)).toEqual(sizeOf(stages[0]!));
  // Scroll the second page's top to just under the context bar slot: it fits there whole.
  await page.evaluate((top) => {
    const main = document.querySelector('.canvas-editor-layout__main')!;
    const wrapper = document.querySelectorAll('.heterogeneous-multipage__page-wrapper')[1]!;
    main.scrollTop += wrapper.getBoundingClientRect().top - top;
  }, visible.top);
  const second = (await measure(page)).stages[1]!;
  expect(second.top).toBeGreaterThanOrEqual(visible.top);
  expect(second.bottom).toBeLessThanOrEqual(visible.bottom);
});
