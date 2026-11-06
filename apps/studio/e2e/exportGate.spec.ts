// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Render gate, stage 3: what the SVG and PDF exports look like against the canvas they were made
 * from. Every template of the open pack on the default brand, in each declared format and in the
 * light world (else the first one the brand offers), is drawn in Chromium, exported as SVG with
 * glyph outlines, SVG with `<text>` and PDF, and each file is drawn again at the size of the page:
 * the SVG by the browser, the PDF by pdf.js. The Konva PNG and the drawn file are compared pixel
 * by pixel; the share of pixels a channel of which is off by more than `TOLERANCE` may not pass
 * `MAX_SHARE`.
 *
 * Besides the pixels: the export must say nothing is missing, did not fall back to a raster PDF,
 * and a template without a photo slot must have no raster island at all.
 *
 * One page load per template and format: `export=all` makes the three files in it. A failure
 * attaches the canvas, the drawn file, a diff (red = differing pixels) and the file itself.
 *
 * Every case logs one `[export-gate]` line with its measured share: read the distribution off the
 * first CI run before trusting the threshold.
 *
 * Run it in the Playwright image (`scripts/gate-render-docker.sh`), never on the host.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { FORMAT_OF_ASPECT, load, templates } from './gatePack.js';
import {
  GATE_EXPORT_MODES,
  type GateExport,
  type GateExportMode,
  type GateResult,
} from '../src/gate/result.js';

/** A pixel differs when some channel is off by more than this (of 255; about 0.1). */
const TOLERANCE = 25;
/** At most this share of the page's pixels may differ. */
const MAX_SHARE = 0.01;
/** The page, the export and the pictures: a cold page load, three exports, font subsetting. */
const LOAD_TIMEOUT = 120_000;

interface Comparison {
  width: number;
  height: number;
  differing: number;
  total: number;
  /** The largest channel delta of any pixel. */
  maxDelta: number;
  /** The bounding box of the differing pixels (inclusive), or null when there are none. */
  box: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** The differing pixels per tenth of the page's height, top to bottom. */
  bands: number[];
  /** Differing pixels red over the faded canvas, as a PNG data URL; only when over `maxShare`. */
  diff: string | null;
}

/**
 * Runs in the page and compares `exportPng` with the picture of export `index`, both laid over
 * white at the canvas PNG's size. Self-contained: Playwright serialises the function.
 */
async function compareInPage(args: {
  index: number;
  tolerance: number;
  maxShare: number;
}): Promise<Comparison> {
  const gate = window.__gate!;
  const drawn = gate.exports![args.index]!.exportedPng!;
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('a PNG of the gate did not load'));
      image.src = src;
    });
  const [canvasImage, exportedImage] = await Promise.all([load(gate.exportPng!), load(drawn)]);
  const { width, height } = canvasImage;
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const context = surface.getContext('2d', { willReadFrequently: true })!;
  const pixels = (image: HTMLImageElement) => {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  };
  const a = pixels(canvasImage);
  const b = pixels(exportedImage);
  const diff = new ImageData(width, height);
  let differing = 0;
  let maxDelta = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  // Tenths of the page's height; a module constant would not reach the page.
  const BANDS = 10;
  const bands = new Array<number>(BANDS).fill(0);
  for (let at = 0; at < a.length; at += 4) {
    const delta = Math.max(
      Math.abs(a[at]! - b[at]!),
      Math.abs(a[at + 1]! - b[at + 1]!),
      Math.abs(a[at + 2]! - b[at + 2]!)
    );
    if (delta > maxDelta) maxDelta = delta;
    if (delta > args.tolerance) {
      differing += 1;
      const pixel = at / 4;
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      bands[Math.min(BANDS - 1, Math.floor((y * BANDS) / height))]! += 1;
      diff.data[at] = 255;
      diff.data[at + 1] = 0;
      diff.data[at + 2] = 0;
    } else {
      // The canvas, faded to a third, so the diff shows where the differences are on the page.
      const grey = 0.3 * a[at]! + 0.59 * a[at + 1]! + 0.11 * a[at + 2]!;
      const faded = 255 - (255 - grey) / 3;
      diff.data[at] = faded;
      diff.data[at + 1] = faded;
      diff.data[at + 2] = faded;
    }
    diff.data[at + 3] = 255;
  }
  const total = width * height;
  let url: string | null = null;
  if (differing / total > args.maxShare) {
    context.putImageData(diff, 0, 0);
    url = surface.toDataURL('image/png');
  }
  const box = differing > 0 ? { minX, minY, maxX, maxY } : null;
  return { width, height, differing, total, maxDelta, box, bands, diff: url };
}

/**
 * What an export run reports, without its pictures and files: they are megabytes per case, and
 * only a failure wants them (`pictures`). The comparison reads them in the page.
 */
async function openExport(page: Page, params: Record<string, string>): Promise<GateResult> {
  await load(page, params, LOAD_TIMEOUT);
  return page.evaluate(() => {
    const gate = window.__gate!;
    const { exportPng: _exportPng, ...rest } = gate;
    return {
      ...rest,
      exports: gate.exports?.map((e) => ({ ...e, exported: null, exportedPng: null })),
    };
  });
}

/** The canvas, the drawn file and the file of export `index`, as the page holds them. */
function pictures(page: Page, index: number) {
  return page.evaluate((at) => {
    const gate = window.__gate!;
    const exported = gate.exports![at]!;
    return { canvas: gate.exportPng!, drawn: exported.exportedPng!, file: exported.exported! };
  }, index);
}

const bytesOf = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

const EXTENSION: Record<GateExportMode, string> = {
  'svg-outlines': 'svg',
  'svg-editable': 'svg',
  pdf: 'pdf',
};

/** `element:"text"=U+0041 U+0042`: the text of a glyph the fonts lack, as the code points to look up. */
function describeMissingGlyph(glyph: { elementId: string | null; text: string }): string {
  const points = [...glyph.text]
    .map((char) => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ');
  return `${glyph.elementId ?? '-'}:${JSON.stringify(glyph.text)}=${points}`;
}

/** The box of the differing pixels and how they spread down the page, to say which element differs. */
function describeDifference(result: Comparison): string {
  const { minX, minY, maxX, maxY } = result.box!;
  const rows = result.bands
    .map((count, band) => (count > 0 ? `${band * 10}%:${count}` : null))
    .filter((band) => band !== null)
    .join(',');
  return `box=${minX},${minY},${maxX},${maxY} rows=[${rows}]`;
}

interface Expectations {
  /** The report lists no raster island (a template without a photo slot). */
  noIslands: boolean;
  /** Island reasons the report must list, in every export and in the PDF only. */
  mustHave: readonly string[];
  mustHaveInPdf: readonly string[];
}

/** One export of a drawn page: the checks, soft, so the other modes are still compared. */
async function checkExport(
  page: Page,
  testInfo: TestInfo,
  label: string,
  gate: GateResult,
  index: number,
  expectations: Expectations
): Promise<void> {
  const exported: GateExport = gate.exports![index]!;
  const where = `[${exported.mode}] ${label}`;
  // Once per page, not per mode.
  if (index === 0) {
    expect.soft(gate.images, `${label}: images still loading or failed`).toEqual({
      pending: 0,
      failed: 0,
    });
  }
  expect.soft(exported.error, `${where}: export or drawing failed`).toBeNull();
  if (exported.error !== null || !exported.report || !exported.size || !gate.page) return;

  const { report, size } = exported;
  const islands = report.rasterIslands.map((island) => island.reason);
  expect.soft(report.fallback, `${where}: fell back to the raster PDF`).toBeNull();
  expect.soft(report.missingElements, `${where}: elements missing from the export`).toEqual([]);
  if (expectations.noIslands) {
    expect.soft(report.rasterIslands, `${where}: raster islands`).toEqual([]);
  }
  const wanted = [
    ...expectations.mustHave,
    ...(exported.mode === 'pdf' ? expectations.mustHaveInPdf : []),
  ];
  for (const reason of wanted) {
    expect.soft(islands, `${where}: island reason ${reason}`).toContain(reason);
  }

  // The file has the page's shape; an SVG also its size in px.
  const pageShape = gate.page.width / gate.page.height;
  expect
    .soft(
      Math.abs(size.width / size.height - pageShape),
      `${where}: file aspect ${size.width}x${size.height}`
    )
    .toBeLessThan(0.002);
  if (exported.mode !== 'pdf') {
    expect
      .soft(Math.abs(size.width - gate.page.width), `${where}: svg width`)
      .toBeLessThanOrEqual(1);
    expect
      .soft(Math.abs(size.height - gate.page.height), `${where}: svg height`)
      .toBeLessThanOrEqual(1);
  }

  const result = await page.evaluate(compareInPage, {
    index,
    tolerance: TOLERANCE,
    maxShare: MAX_SHARE,
  });
  expect
    .soft(
      Math.max(
        Math.abs(result.width - gate.page.width),
        Math.abs(result.height - gate.page.height)
      ),
      `${where}: the canvas PNG is ${result.width}x${result.height}, the page ${gate.page.width}x${gate.page.height}`
    )
    .toBeLessThanOrEqual(1);
  const share = result.differing / result.total;
  const percent = (share * 100).toFixed(3);
  const failing = share > MAX_SHARE;
  console.log(
    `[export-gate] ${label} ${gate.scheme} ${exported.mode} share=${percent}% ` +
      `differing=${result.differing} maxDelta=${result.maxDelta} ` +
      `islands=${JSON.stringify(islands)} unknownCalls=${report.unknownCalls.length} ` +
      `missingGlyphs=${report.missingGlyphs.length}` +
      // Which glyphs, and (for a failure) where on the page the pixels differ.
      (report.missingGlyphs.length > 0
        ? ` missing=${report.missingGlyphs.map(describeMissingGlyph).join(' ')}`
        : '') +
      (failing && result.box ? ` ${describeDifference(result)}` : '')
  );
  testInfo.annotations.push({ type: `share ${exported.mode}`, description: `${percent} %` });
  expect
    .soft(share, `${where}: ${percent} % of the pixels differ (limit ${MAX_SHARE * 100} %)`)
    .toBeLessThanOrEqual(MAX_SHARE);

  if (failing) {
    // Files, not buffers: a buffer attachment lives in the reporter and never reaches
    // `test-results/`, which is what CI uploads.
    const held = await pictures(page, index);
    mkdirSync(testInfo.outputDir, { recursive: true });
    const attach = async (suffix: string, bytes: Buffer, contentType: string) => {
      const file = path.join(testInfo.outputDir, `${label}-${exported.mode}-${suffix}`);
      writeFileSync(file, bytes);
      await testInfo.attach(`${label}-${exported.mode}-${suffix}`, { path: file, contentType });
    };
    await attach('canvas.png', bytesOf(held.canvas), 'image/png');
    await attach('drawn.png', bytesOf(held.drawn), 'image/png');
    await attach('diff.png', bytesOf(result.diff!), 'image/png');
    await attach(
      `export.${EXTENSION[exported.mode]}`,
      bytesOf(held.file),
      exported.mode === 'pdf' ? 'application/pdf' : 'image/svg+xml'
    );
  }
}

for (const template of templates) {
  const hasPhotoSlot = Object.values(template.slots ?? {}).some((slot) => slot.role === 'photo');
  for (const aspect of template.formats) {
    const format = FORMAT_OF_ASPECT[aspect];
    const label = `${template.id}-${format}`;
    test(`export matches the canvas: ${label}`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      expect(format, `no Studio format for aspect ${aspect}`).toBeDefined();
      const gate = await openExport(page, {
        template: template.id,
        brand: 'default',
        format: format!,
        export: 'all',
      });
      expect(gate.error).toBeNull();
      expect(gate.exports?.map((e) => e.mode)).toEqual([...GATE_EXPORT_MODES]);
      // A photo slot is filled with a sample photo in the gate and may carry a filter, which is
      // a raster island by design: its islands are logged, not asserted.
      for (let index = 0; index < GATE_EXPORT_MODES.length; index++) {
        await checkExport(page, testInfo, label, gate, index, {
          noIslands: !hasPhotoSlot,
          mustHave: [],
          mustHaveInPdf: [],
        });
      }
    });
  }
}

// Pictures the templates never have: a PNG and a WebP data URL, an uploaded SVG with a style
// sheet (cannot be inlined: an `svg-unsupported` island) and a photo with a drop shadow (an SVG
// filter; a `shadow` island in the PDF).
test('export fixture: photo, webp, svg upload, shadowed photo', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const gate = await openExport(page, {
    template: 'studio-quote',
    brand: 'default',
    format: 'post-portrait',
    export: 'all',
    fixture: 'export',
  });
  expect(gate.error).toBeNull();
  expect(gate.exports?.map((e) => e.mode)).toEqual([...GATE_EXPORT_MODES]);
  for (let index = 0; index < GATE_EXPORT_MODES.length; index++) {
    await checkExport(page, testInfo, 'fixture-export', gate, index, {
      noIslands: false,
      mustHave: ['svg-unsupported'],
      mustHaveInPdf: ['shadow'],
    });
  }
});
