// SPDX-License-Identifier: AGPL-3.0-only
// The wiring every host of the vector exports shares (the shell, the render gate): which stage a
// page is read from, the font sources, and the resolution of raster islands.
import { brandDefault, type BrandPack } from '@ggraphic/core';
import { describe, expect, it, vi } from 'vitest';

import { type CanvasFormat, type PrintCanvasFormat } from '../formats/index.js';
import type { CanvasExportFontService } from '../hostServices.js';
import { printPixelRatio } from './printExport.js';
import { rasterizeOps } from './scene/browserDeps.js';
import { emptyReport, type RecordedScene } from './scene/types.js';
import { createVectorDeps, type VectorExportCanvas } from './vectorDeps.js';

const DIGITAL: CanvasFormat = {
  id: 'test-post',
  label: 'Post',
  description: '',
  group: 'post',
  category: 'digital',
  width: 200,
  height: 100,
  dpi: 72,
  iconKey: 'landscape',
  defaultExport: 'png',
  exportable: ['png', 'pdf'],
  print: null,
};
const PRINT: PrintCanvasFormat = {
  ...DIGITAL,
  id: 'test-print',
  group: 'print',
  category: 'print',
  width: 308, // trim + bleed at 2 px to the mm
  height: 432,
  print: {
    trimMm: { w: 148, h: 210 },
    bleedMm: 3,
    safeMm: 5,
    exportDpi: 300,
    pageCount: 1,
    imprint: null,
  },
};

const BRAND: BrandPack = {
  ...brandDefault,
  fontFaces: [{ family: 'Test Sans', src: 'test-sans.woff2' }],
  fonts: { ...brandDefault.fonts, boldFamilies: { 'Test Sans': 'Test Sans Bold' } },
};
const PLAIN_BRAND: BrandPack = {
  ...brandDefault,
  fonts: { ...brandDefault.fonts, boldFamilies: undefined },
};

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const PNG_URL = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`;
const BOX = { x: 1, y: 2, width: 30, height: 40 };

function canvasStub() {
  const scene: RecordedScene = { width: 200, height: 100, items: [], report: emptyReport() };
  return {
    scene,
    canvas: {
      recordScene: vi.fn(async () => scene),
      rasterizeElement: vi.fn(async () => ({ dataUrl: PNG_URL, box: BOX })),
      rasterizeNode: vi.fn(async () => PNG_BYTES),
    } satisfies VectorExportCanvas,
  };
}

describe('createVectorDeps: raster resolution', () => {
  it('is 2 px to the page px for a digital format', () => {
    const deps = createVectorDeps({ canvasOf: () => null, brand: BRAND, format: DIGITAL });

    expect(deps.resolveDeps(0).rasterPixelRatio).toBe(2);
  });

  it('is the print ratio of the format for a print format', () => {
    const deps = createVectorDeps({ canvasOf: () => null, brand: BRAND, format: PRINT });

    const ratio = deps.resolveDeps(0).rasterPixelRatio;
    expect(ratio).toBe(printPixelRatio(PRINT));
    // 300 dpi on a stage of 2 px to the mm: 11.811 device px per mm over 2.
    expect(ratio).toBeCloseTo(5.9055, 3);
  });
});

describe('createVectorDeps: fonts', () => {
  it('hands the host font service on first, with the brand faces and bold families', () => {
    const exportFonts: CanvasExportFontService = { load: async () => null };

    const { fontDeps } = createVectorDeps({
      canvasOf: () => null,
      exportFonts,
      brand: BRAND,
      format: DIGITAL,
    });

    expect(fontDeps.host).toBe(exportFonts);
    expect(fontDeps.brandFaces).toBe(BRAND.fontFaces);
    expect(fontDeps.boldFamilies).toEqual({ 'Test Sans': 'Test Sans Bold' });
  });

  it('leaves the host and the bold families out when there are none', () => {
    for (const exportFonts of [undefined, null]) {
      const { fontDeps } = createVectorDeps({
        canvasOf: () => null,
        exportFonts,
        brand: PLAIN_BRAND,
        format: DIGITAL,
      });

      expect('host' in fontDeps).toBe(false);
      expect('boldFamilies' in fontDeps).toBe(false);
      expect(fontDeps.brandFaces).toBe(PLAIN_BRAND.fontFaces);
    }
  });
});

describe('createVectorDeps: the stage of each page', () => {
  it('records page `index` and names it by its number', async () => {
    const first = canvasStub();
    const second = canvasStub();
    const deps = createVectorDeps({
      canvasOf: (index) => [first.canvas, second.canvas][index],
      brand: BRAND,
      format: DIGITAL,
    });

    const recorded = await deps.recordPage(1, { transparent: true });

    expect(recorded).toBe(second.scene);
    expect(second.canvas.recordScene).toHaveBeenCalledWith({ page: 2, transparent: true });
    expect(first.canvas.recordScene).not.toHaveBeenCalled();
    expect(deps.resolveDeps(1).page).toBe(2);
  });

  it('answers null for a page that is not mounted', async () => {
    const deps = createVectorDeps({ canvasOf: () => undefined, brand: BRAND, format: DIGITAL });

    expect(await deps.recordPage(0, { transparent: false })).toBeNull();
    const resolve = deps.resolveDeps(0);
    expect(await resolve.rasterizeElement('a', 2)).toBeNull();
    expect(await resolve.rasterizeNode({}, 2)).toBeNull();
  });

  it('draws an element and a node from that page’s stage, the element as a png with its box', async () => {
    const { canvas } = canvasStub();
    const node = {};
    const resolve = createVectorDeps({
      canvasOf: () => canvas,
      brand: BRAND,
      format: DIGITAL,
    }).resolveDeps(0);

    expect(await resolve.rasterizeElement('photo', 3)).toEqual({ png: PNG_BYTES, box: BOX });
    expect(canvas.rasterizeElement).toHaveBeenCalledWith('photo', 3);
    expect(await resolve.rasterizeNode(node, 3)).toBe(PNG_BYTES);
    expect(canvas.rasterizeNode).toHaveBeenCalledWith(node, 3);
  });

  it('answers null for an element the stage drew as something that is no png', async () => {
    const { canvas } = canvasStub();
    canvas.rasterizeElement.mockResolvedValue({ dataUrl: 'data:text/plain,hi', box: BOX });
    const resolve = createVectorDeps({
      canvasOf: () => canvas,
      brand: BRAND,
      format: DIGITAL,
    }).resolveDeps(0);

    expect(await resolve.rasterizeElement('photo', 2)).toBeNull();
  });

  it('uses the browser’s image reading and rasteriser', () => {
    const resolve = createVectorDeps({
      canvasOf: () => null,
      brand: BRAND,
      format: DIGITAL,
    }).resolveDeps(0);

    expect(resolve.rasterizeOps).toBe(rasterizeOps);
  });
});
