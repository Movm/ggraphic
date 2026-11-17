// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { brandDefault, type BrandPack } from '@ggraphic/core';
import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

import { type CanvasFormat, type PrintCanvasFormat } from '../formats/index.js';
import { extractText, inspectPdf } from './pdf/__fixtures__/inspectPdf.js';
import { napiRasterize } from './pdf/__fixtures__/napiRasterize.js';
import { writePdf } from './pdf/writePdf.js';
import type * as WritePdfModule from './pdf/writePdf.js';
import { IDENTITY } from './scene/matrix.js';
import type { ResolveDeps } from './scene/resolveScene.js';
import {
  emptyReport,
  type ExportReport,
  type FontSpec,
  type RecordedScene,
  type SceneOp,
} from './scene/types.js';
import { SLIDE_PDF_PAGE_PT } from './slidesPdf.js';
import {
  exportPagesPdf,
  exportPagesSvg,
  type PdfExportOptions,
  type VectorExportDeps,
} from './vectorExport.js';

// The real writer, except where a test makes it throw or hang.
vi.mock('./pdf/writePdf.js', async (importOriginal) => {
  const actual = await importOriginal<typeof WritePdfModule>();
  return { ...actual, writePdf: vi.fn(actual.writePdf) };
});

// ---------------------------------------------------------------------------------------------
// Fixtures

const fontsourceDir = path.dirname(
  createRequire(import.meta.url).resolve('@fontsource/instrument-sans/package.json')
);
const latinBytes = new Uint8Array(
  readFileSync(path.join(fontsourceDir, 'files', 'instrument-sans-latin-400-normal.woff2'))
);
const FACE: FontSpec = { family: 'Instrument Sans', weight: 400, style: 'normal', size: 40 };

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const base = { matrix: IDENTITY, alpha: 1, clips: [], shadow: null } as const;

const square: SceneOp = {
  ...base,
  kind: 'path',
  mode: 'fill',
  commands: [
    { op: 'M', x: 0, y: 0 },
    { op: 'L', x: 40, y: 0 },
    { op: 'L', x: 40, y: 40 },
    { op: 'Z' },
  ],
  rule: 'nonzero',
  paint: { type: 'solid', hex: '#00a050', alpha: 1 },
  stroke: null,
};

const text = (value: string, font: FontSpec = FACE): SceneOp => ({
  ...base,
  kind: 'text',
  mode: 'fill',
  text: value,
  xs: Array.from(value, (_c, n) => 10 + n * 20),
  y: 60,
  font,
  paint: { type: 'solid', hex: '#112233', alpha: 1 },
  stroke: null,
});

const scene = (
  ops: SceneOp[],
  report: ExportReport = emptyReport(),
  elementId: string | null = 'title'
): RecordedScene => ({
  width: 200,
  height: 100,
  items: [{ elementId, label: elementId && 'Title', ops }],
  report,
});

/** A raster island the recorder left without pixels, on an item with no id to look it up by. */
const island = (nodeRef: unknown): SceneOp => ({
  ...base,
  kind: 'raster',
  png: null,
  source: null,
  nodeRef,
  x: 0,
  y: 0,
  width: 20,
  height: 20,
  reason: 'filter',
});

function resolveDepsOf(over: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    page: 0,
    fetchBytes: async () => null,
    reencode: async () => null,
    rasterizeElement: async () => null,
    rasterizeNode: async () => null,
    rasterizeOps: async () => null,
    rasterPixelRatio: 2,
    ...over,
  };
}

interface Setup {
  scenes: (RecordedScene | null)[];
  resolve?: Partial<ResolveDeps>;
}

function depsFor({ scenes, resolve }: Setup) {
  const fetchBytes = vi.fn(async (_url: string) => latinBytes);
  const recordPage = vi.fn(
    async (index: number, _options: { transparent: boolean }) => scenes[index] ?? null
  );
  const deps: VectorExportDeps = {
    recordPage,
    resolveDeps: () => resolveDepsOf(resolve),
    fontDeps: { brandFaces: [{ family: FACE.family, src: 'latin.woff2' }], fetchBytes },
  };
  return { deps, fetchBytes, recordPage };
}

const OPTIONS = { text: 'outlines', transparent: false, filenameBase: 'Plakat' } as const;
const read = (blob: Blob) => blob.text();
const unzip = async (blob: Blob) => unzipSync(new Uint8Array(await blob.arrayBuffer()));

// ---------------------------------------------------------------------------------------------

describe('exportPagesSvg', () => {
  it('one page gives an svg blob named <base>.svg', async () => {
    const { deps } = depsFor({ scenes: [scene([square])] });

    const { blob, filename } = await exportPagesSvg([0], OPTIONS, deps);

    expect(filename).toBe('Plakat.svg');
    expect(blob.type).toBe('image/svg+xml');
    const svg = await read(blob);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).toContain('data-element-id="title"');
  });

  it('two pages give a zip with <base>-1.svg and <base>-2.svg', async () => {
    const { deps } = depsFor({ scenes: [scene([square]), scene([square])] });

    const { blob, filename } = await exportPagesSvg([0, 1], OPTIONS, deps);

    expect(filename).toBe('Plakat.zip');
    expect(blob.type).toBe('application/zip');
    const entries = await unzip(blob);
    expect(Object.keys(entries)).toEqual(['Plakat-1.svg', 'Plakat-2.svg']);
    expect(new TextDecoder().decode(entries['Plakat-1.svg'])).toMatch(/^<svg /);
  });

  it('numbers the files by page, not by their place in the selection', async () => {
    const { deps } = depsFor({ scenes: [scene([square]), scene([square]), scene([square])] });

    const { blob } = await exportPagesSvg([1, 2], OPTIONS, deps);

    expect(Object.keys(await unzip(blob))).toEqual(['Plakat-2.svg', 'Plakat-3.svg']);
  });

  it('hands the transparency choice to the recorder', async () => {
    const { deps, recordPage } = depsFor({ scenes: [scene([square])] });

    await exportPagesSvg([0], { ...OPTIONS, transparent: true }, deps);

    expect(recordPage).toHaveBeenCalledWith(0, { transparent: true });
  });

  it('draws text as outlines, finding each face once however many pages and groups use it', async () => {
    const grouped: SceneOp = { ...base, kind: 'group', ops: [text('Hi')] };
    const { deps, fetchBytes } = depsFor({
      scenes: [scene([text('Hi')]), scene([grouped, text('Ho')])],
    });

    const { blob } = await exportPagesSvg([0, 1], OPTIONS, deps);

    const entries = await unzip(blob);
    for (const file of Object.values(entries)) {
      const svg = new TextDecoder().decode(file);
      expect(svg).toContain('<path');
      expect(svg).not.toContain('<text');
    }
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  describe('a picture with text of its own (a chart)', () => {
    const chart = (family: string): SceneOp => ({
      ...base,
      kind: 'image',
      image: {
        kind: 'svg',
        markup:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50">' +
          `<style>@font-face{font-family:"Instrument Sans";src:url(data:font/woff2;base64,AA==) format("woff2")}</style>` +
          `<text x="5" y="30" font-size="20" font-family="${family}" fill="#223344">Hi</text></svg>`,
        width: 100,
        height: 50,
      },
      sx: 0,
      sy: 0,
      sw: 100,
      sh: 50,
      dx: 10,
      dy: 10,
      dw: 100,
      dh: 50,
    });

    it('is outlined with the font its text names, and no font travels in the file', async () => {
      // The page itself has no text: the face is found only through the picture.
      const { deps, fetchBytes } = depsFor({ scenes: [scene([chart('Instrument Sans')])] });

      const { blob, report } = await exportPagesSvg([0], OPTIONS, deps);

      const svg = await read(blob);
      expect(svg).not.toContain('<text');
      expect(svg).not.toContain('@font-face');
      expect(svg).toContain('fill="#223344"');
      expect(fetchBytes).toHaveBeenCalledTimes(1);
      expect(report.missingGlyphs).toEqual([]);
    });

    it('is set in the font of the page where it names a generic family', async () => {
      const { deps, fetchBytes } = depsFor({
        scenes: [scene([text('Hi'), chart('sans-serif')])],
      });

      const { blob, report } = await exportPagesSvg([0], OPTIONS, deps);

      const svg = await read(blob);
      expect(svg).not.toContain('<text');
      expect(svg).not.toContain('@font-face');
      expect(fetchBytes).toHaveBeenCalledTimes(1);
      expect(report.missingGlyphs).toEqual([]);
    });

    it('is left as it is, with no font looked for, when the text is editable', async () => {
      const { deps, fetchBytes } = depsFor({ scenes: [scene([chart('Instrument Sans')])] });

      const { blob } = await exportPagesSvg([0], { ...OPTIONS, text: 'editable' }, deps);

      const svg = await read(blob);
      expect(svg).toContain('<text');
      expect(svg).toContain('@font-face');
      expect(fetchBytes).not.toHaveBeenCalled();
    });
  });

  it('keeps text as text, and looks for no font, when it is left editable', async () => {
    const { deps, fetchBytes } = depsFor({ scenes: [scene([text('Hi')])] });

    const { blob } = await exportPagesSvg([0], { ...OPTIONS, text: 'editable' }, deps);

    const svg = await read(blob);
    expect(svg).toContain('<text');
    expect(svg).toContain('font-family="Instrument Sans"');
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('writes the text of a face nobody has as text, and says so', async () => {
    const { deps } = depsFor({ scenes: [scene([text('Hi')])] });
    deps.fontDeps = {};

    const { blob, report } = await exportPagesSvg([0], OPTIONS, deps);

    expect(await read(blob)).toContain('<text');
    expect(report.missingGlyphs).toEqual([{ page: 1, elementId: 'title', text: 'Hi' }]);
  });

  it('resolves the scene before it writes it: an island gets its pixels', async () => {
    const node = {};
    const rasterizeNode = vi.fn(async () => PNG);
    const { deps } = depsFor({
      scenes: [scene([island(node)], emptyReport(), null)],
      resolve: { rasterizeNode },
    });

    const { blob } = await exportPagesSvg([0], OPTIONS, deps);

    expect(rasterizeNode).toHaveBeenCalledWith(node, 2);
    expect(await read(blob)).toContain('data:image/png;base64,');
  });

  it('merges the reports of the pages and names the page by its number', async () => {
    const first = emptyReport();
    first.rasterIslands.push({ page: 1, elementId: 'photo', reason: 'filter' });
    const second = emptyReport();
    second.rasterIslands.push({ page: 2, elementId: 'badge', reason: 'shadow' });
    const { deps } = depsFor({
      scenes: [scene([square], first), scene([island({})], second, null)],
      // Page 2's island cannot be drawn: the element is reported missing, on page 2.
      resolve: { rasterizeNode: async () => null },
    });

    const { report } = await exportPagesSvg([0, 1], OPTIONS, deps);

    expect(report.rasterIslands.map((entry) => entry.reason)).toEqual(['filter', 'shadow']);
    expect(report.missingElements).toEqual([
      { page: 2, elementId: null, reason: 'image-unreadable' },
    ]);
  });

  it('throws for a page that cannot be recorded instead of leaving it out', async () => {
    const { deps } = depsFor({ scenes: [scene([square]), null] });

    await expect(exportPagesSvg([0, 1], OPTIONS, deps)).rejects.toThrow('Seite 2');
  });
});

// ---------------------------------------------------------------------------------------------
// exportPagesPdf

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
const SLIDES: CanvasFormat = {
  ...DIGITAL,
  id: 'test-slides',
  group: 'slides',
  width: 960,
  height: 540,
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
  fonts: { ...brandDefault.fonts, body: FACE.family },
  print: { cmyk: { '#1D3557': [100, 80, 30, 40] } },
};

/** A face no source has: its text cannot be a font. */
const LOST: FontSpec = { family: 'Lost Face', weight: 400, style: 'normal', size: 40 };
const RASTER_PDF = new TextEncoder().encode('%PDF-raster');

const ICON = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40">${inner}</svg>`;
const svgImage = (markup: string): SceneOp => ({
  ...base,
  kind: 'image',
  image: { kind: 'svg', markup, width: 120, height: 40 },
  sx: 0,
  sy: 0,
  sw: 120,
  sh: 40,
  dx: 10,
  dy: 10,
  dw: 120,
  dh: 40,
});

/** A square with a shadow: the shadow alone is a raster island. */
const shadowed = (hex: string): SceneOp => ({
  ...square,
  shadow: { hex, alpha: 1, blur: 4, offsetX: 2, offsetY: 2 },
});

const pageOf = (
  items: [string, SceneOp[]][],
  over: Partial<RecordedScene> = {}
): RecordedScene => ({
  width: 200,
  height: 100,
  items: items.map(([elementId, ops]) => ({ elementId, label: elementId, ops })),
  report: emptyReport(),
  ...over,
});

function pdfSetup(scenes: (RecordedScene | null)[], resolve: Partial<ResolveDeps> = {}) {
  const raster = napiRasterize();
  const { deps, fetchBytes, recordPage } = depsFor({
    scenes,
    resolve: { rasterizeOps: raster.rasterize, ...resolve },
  });
  deps.fontDeps = {
    brandFaces: [
      { family: FACE.family, src: 'latin.woff2' },
      { family: 'Second Face', src: 'second.woff2' },
    ],
    fetchBytes,
  };
  const rasterFallback = vi.fn(async () => RASTER_PDF);
  return { deps: { ...deps, rasterFallback }, fetchBytes, recordPage, rasterFallback, raster };
}

const pdfOptions = (over: Partial<PdfExportOptions> = {}): PdfExportOptions => ({
  mode: 'digital',
  format: DIGITAL,
  brand: BRAND,
  filenameBase: 'Plakat',
  pageCount: 1,
  ...over,
});

describe('exportPagesPdf', () => {
  it('writes every page into one pdf named <base>.pdf', async () => {
    const { deps, recordPage, rasterFallback } = pdfSetup([
      pageOf([['a', [text('Eins')]]]),
      pageOf([['b', [text('Zwei')]]]),
    ]);

    const { blob, filename, report } = await exportPagesPdf(pdfOptions({ pageCount: 2 }), deps);

    expect(filename).toBe('Plakat.pdf');
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect((await inspectPdf(bytes)).doc.getPageCount()).toBe(2);
    expect((await extractText(bytes, 1)).join('')).toBe('Zwei');
    // Opaque pages, in order.
    expect(recordPage.mock.calls).toEqual([
      [0, { transparent: false }],
      [1, { transparent: false }],
    ]);
    expect(rasterFallback).not.toHaveBeenCalled();
    expect(report.fallback).toBeNull();
  });

  it('digital pages are 1 pt to the px, slides are SLIDE_PDF_PAGE_PT', async () => {
    const digital = pdfSetup([pageOf([['a', [square]]])]);
    const { blob } = await exportPagesPdf(pdfOptions(), digital.deps);
    const small = await inspectPdf(new Uint8Array(await blob.arrayBuffer()));
    expect(small.doc.getPage(0).getSize()).toEqual({ width: 200, height: 100 });

    const slides = pdfSetup([pageOf([['a', [square]]], { width: 960, height: 540 })]);
    const result = await exportPagesPdf(
      pdfOptions({ mode: 'slides', format: SLIDES }),
      slides.deps
    );
    const deck = await inspectPdf(new Uint8Array(await result.blob.arrayBuffer()));
    expect(deck.doc.getPage(0).getSize()).toEqual(SLIDE_PDF_PAGE_PT);
  });

  it('print pages carry the format’s trim and bleed boxes, and rasterise at the print ratio', async () => {
    const { deps, raster } = pdfSetup(
      [pageOf([['a', [square, shadowed('#000000')]]], { width: 308, height: 432 })],
      { rasterPixelRatio: 4 }
    );

    const { blob } = await exportPagesPdf(pdfOptions({ mode: 'print', format: PRINT }), deps);

    const pdf = await inspectPdf(new Uint8Array(await blob.arrayBuffer()));
    const page = pdf.doc.getPage(0);
    // 148 mm + 2 × 3 mm bleed, + 2 × 5 mm for the marks; and the trim 8 mm in from the media box.
    expect(page.getMediaBox().width).toBeCloseTo(((148 + 6 + 10) * 72) / 25.4, 3);
    expect(page.getBleedBox().width).toBeCloseTo(((148 + 6) * 72) / 25.4, 3);
    expect(page.getTrimBox().width).toBeCloseTo((148 * 72) / 25.4, 3);
    expect(page.getTrimBox().x).toBeCloseTo((8 * 72) / 25.4, 3);
    expect(pdf.content(0)).toContain('0 0 0 1 K');
    expect(raster.calls.every((call) => call.pixelRatio === 4)).toBe(true);
  });

  it('refuses the print mode for a format without a print profile', async () => {
    const { deps, rasterFallback } = pdfSetup([pageOf([['a', [square]]])]);

    // A mistake in the caller is no reason to print a raster pdf of something else.
    await expect(exportPagesPdf(pdfOptions({ mode: 'print' }), deps)).rejects.toThrow(/print/);
    expect(rasterFallback).not.toHaveBeenCalled();
  });

  it('writes the colours of the brand’s print map as CMYK and reports the palette colours left RGB', async () => {
    const mapped = { ...square, paint: { type: 'solid', hex: '#1d3557', alpha: 1 } } as SceneOp;
    const other = { ...square, paint: { type: 'solid', hex: '#457b9d', alpha: 1 } } as SceneOp;
    const { deps } = pdfSetup([pageOf([['a', [mapped, other]]])]);

    const { blob, report } = await exportPagesPdf(pdfOptions(), deps);

    const pdf = await inspectPdf(new Uint8Array(await blob.arrayBuffer()));
    expect(pdf.content(0)).toContain('1 0.8 0.3 0.4 k');
    expect(pdf.content(0)).toContain('rg');
    // brandDefault's ocean is in its palette and has no print value here.
    expect(report.rgbBrandColors).toEqual(['#457b9d']);
  });

  it('applies print values whatever the case or length of their key, and finds short palette colours', async () => {
    const white = { ...square, paint: { type: 'solid', hex: '#ffffff', alpha: 1 } } as SceneOp;
    const teal = { ...square, paint: { type: 'solid', hex: '#aabbcc', alpha: 1 } } as SceneOp;
    const night = { ...square, paint: { type: 'solid', hex: '#1d3557', alpha: 1 } } as SceneOp;
    const { deps } = pdfSetup([pageOf([['a', [white, teal, night]]])]);
    const brand: BrandPack = {
      ...BRAND,
      palette: [...BRAND.palette, { id: 'teal', label: 'Teal', color: '#ABC' }],
      print: { cmyk: { '#FFF': [0, 0, 0, 5], '#1D3557': [100, 80, 30, 40] } },
    };

    const { blob, report } = await exportPagesPdf(pdfOptions({ brand }), deps);

    const pdf = await inspectPdf(new Uint8Array(await blob.arrayBuffer()));
    expect(pdf.content(0)).toContain('0 0 0 0.05 k');
    expect(pdf.content(0)).toContain('1 0.8 0.3 0.4 k');
    // Only the short palette colour without a print value is left RGB, and it is found.
    expect(report.rgbBrandColors).toEqual(['#aabbcc']);
  });

  it('writes a pure RGB pdf for a brand without print values', async () => {
    const mapped = { ...square, paint: { type: 'solid', hex: '#1d3557', alpha: 1 } } as SceneOp;
    const { deps } = pdfSetup([pageOf([['a', [mapped]]])]);
    const { print: _print, ...plain } = BRAND;

    const { blob, report } = await exportPagesPdf(pdfOptions({ brand: plain }), deps);

    const pdf = await inspectPdf(new Uint8Array(await blob.arrayBuffer()));
    expect(pdf.content(0)).not.toMatch(/ k\n/);
    expect(report.rgbBrandColors).toEqual(['#1d3557']);
  });

  describe('fonts', () => {
    it('finds the faces of text inside an SVG, in the body font where it names none', async () => {
      // No text of the page's own: the chart's labels are all there is to draw.
      const chart = svgImage(
        ICON(
          '<text x="2" y="12" font-family="sans-serif" font-size="10">Hallo</text>' +
            '<text x="2" y="30" font-family="Second Face" font-size="10">Welt</text>'
        )
      );
      const { deps, fetchBytes } = pdfSetup([pageOf([['chart', [chart]]])]);

      const { blob, report } = await exportPagesPdf(pdfOptions(), deps);

      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect((await extractText(bytes)).join('')).toBe('HalloWelt');
      expect(report.rasterIslands).toEqual([]);
      expect(fetchBytes.mock.calls.map(([url]) => url).sort()).toEqual([
        'latin.woff2',
        'second.woff2',
      ]);
    });
  });

  describe('the raster fallback', () => {
    const lost = (value: string) => text(value, LOST);

    it('more than one element with unresolvable fonts: a raster pdf and report.fallback', async () => {
      const { deps, rasterFallback } = pdfSetup([
        pageOf([
          ['a', [lost('Eins')]],
          ['b', [lost('Zwei')]],
        ]),
      ]);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { blob, filename, report } = await exportPagesPdf(pdfOptions(), deps);

      expect(rasterFallback).toHaveBeenCalledTimes(1);
      expect(await blob.text()).toBe('%PDF-raster');
      expect(filename).toBe('Plakat.pdf');
      expect(report.fallback?.reason).toMatch(/2 elements/);
      expect(report.fallback?.kind).toBe('fonts');
      // What the vector attempt found says nothing about the raster pdf.
      expect(report.rasterIslands).toEqual([]);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('counts the elements of all pages together', async () => {
      const { deps, rasterFallback } = pdfSetup([
        pageOf([['a', [lost('Eins')]]]),
        pageOf([['b', [lost('Zwei')]]]),
      ]);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { report } = await exportPagesPdf(pdfOptions({ pageCount: 2 }), deps);

      expect(rasterFallback).toHaveBeenCalledTimes(1);
      expect(report.fallback).not.toBeNull();
      vi.restoreAllMocks();
    });

    it('one element with an unresolvable font: no fallback, that text rastered', async () => {
      const { deps, rasterFallback } = pdfSetup([
        // Several runs of one element are still one element.
        pageOf([
          ['a', [lost('Eins'), lost('Zwei')]],
          ['b', [text('Drei')]],
        ]),
      ]);

      const { blob, report } = await exportPagesPdf(pdfOptions(), deps);

      expect(rasterFallback).not.toHaveBeenCalled();
      expect(report.fallback).toBeNull();
      expect(report.rasterIslands.map((entry) => entry.reason)).toEqual([
        'font-unavailable',
        'font-unavailable',
      ]);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect((await extractText(bytes)).join('').replace(/\s/g, '')).toBe('Drei');
    });

    it('other raster islands never trigger it', async () => {
      // Three elements with a glyph the font lacks, and three with a shadow.
      const { deps, rasterFallback } = pdfSetup([
        pageOf([
          ['a', [text('Ā')]],
          ['b', [text('Ā')]],
          ['c', [text('Ā')]],
          ['d', [shadowed('#000000')]],
          ['e', [shadowed('#111111')]],
          ['f', [shadowed('#222222')]],
        ]),
      ]);

      const { report } = await exportPagesPdf(pdfOptions(), deps);

      expect(rasterFallback).not.toHaveBeenCalled();
      expect(report.rasterIslands).toHaveLength(6);
      expect(report.fallback).toBeNull();
    });

    it('writer throws: a raster pdf', async () => {
      const { deps, rasterFallback } = pdfSetup([pageOf([['a', [square]]])]);
      vi.mocked(writePdf).mockRejectedValueOnce(new Error('fontkit exploded'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { blob, report } = await exportPagesPdf(pdfOptions(), deps);

      expect(await blob.text()).toBe('%PDF-raster');
      expect(rasterFallback).toHaveBeenCalledTimes(1);
      expect(report.fallback?.reason).toContain('fontkit exploded');
      expect(report.fallback?.kind).toBe('error');
      vi.restoreAllMocks();
    });

    it('writer hangs: a raster pdf after the timeout', async () => {
      const { deps, rasterFallback } = pdfSetup([pageOf([['a', [square]]])]);
      vi.mocked(writePdf).mockImplementationOnce(() => new Promise(() => {}));
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { report } = await exportPagesPdf(pdfOptions({ writeTimeoutMs: 20 }), deps);

      expect(rasterFallback).toHaveBeenCalledTimes(1);
      expect(report.fallback?.reason).toMatch(/did not finish/);
      expect(report.fallback?.kind).toBe('timeout');
      vi.restoreAllMocks();
    });

    it('the time raster islands take does not count against the timeout', async () => {
      const { deps, rasterFallback } = pdfSetup([pageOf([['a', [square]]])]);
      // A writer that spends 120 ms in the rasteriser and 10 ms of its own, under a 60 ms budget.
      vi.mocked(writePdf).mockImplementationOnce(async (_scenes, options) => {
        await options.rasterize([], { x: 0, y: 0, width: 1, height: 1 }, 1);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { bytes: new TextEncoder().encode('%PDF-slow'), report: emptyReport() };
      });
      const slow = deps.resolveDeps;
      deps.resolveDeps = (index) => ({
        ...slow(index),
        rasterizeOps: async () => {
          await new Promise((resolve) => setTimeout(resolve, 120));
          return new Uint8Array(0);
        },
      });

      const { blob, report } = await exportPagesPdf(pdfOptions({ writeTimeoutMs: 60 }), deps);

      expect(rasterFallback).not.toHaveBeenCalled();
      expect(report.fallback).toBeNull();
      expect(await blob.text()).toBe('%PDF-slow');
    });

    it('a raster island that never settles: a raster pdf, kind timeout', async () => {
      const { deps, rasterFallback } = pdfSetup([pageOf([['a', [square]]])]);
      vi.mocked(writePdf).mockImplementationOnce(async (_scenes, options) => {
        await options.rasterize([], { x: 0, y: 0, width: 1, height: 1 }, 1);
        return { bytes: new TextEncoder().encode('%PDF-never'), report: emptyReport() };
      });
      const base = deps.resolveDeps;
      deps.resolveDeps = (index) => ({ ...base(index), rasterizeOps: () => new Promise(() => {}) });
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { report } = await exportPagesPdf(pdfOptions({ islandTimeoutMs: 20 }), deps);

      expect(rasterFallback).toHaveBeenCalledTimes(1);
      expect(report.fallback?.kind).toBe('timeout');
      expect(report.fallback?.reason).toMatch(/raster island/);
      vi.restoreAllMocks();
    });

    it('leaves no timer behind when an abandoned writer ends its pause late', async () => {
      const { deps } = pdfSetup([pageOf([['a', [square]]])]);
      vi.mocked(writePdf).mockImplementationOnce(async (_scenes, options) => {
        await options.rasterize([], { x: 0, y: 0, width: 1, height: 1 }, 1);
        return { bytes: new TextEncoder().encode('%PDF-x'), report: emptyReport() };
      });
      let release: () => void = () => {};
      const base = deps.resolveDeps;
      deps.resolveDeps = (index) => ({
        ...base(index),
        rasterizeOps: () => new Promise((resolve) => (release = () => resolve(new Uint8Array(0)))),
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.useFakeTimers();
      try {
        const done = exportPagesPdf(pdfOptions({ islandTimeoutMs: 20 }), deps);
        await vi.advanceTimersByTimeAsync(25);
        await done;
        release();
        await vi.advanceTimersByTimeAsync(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
        vi.restoreAllMocks();
      }
    });

    it('a page that cannot be recorded: a raster pdf, which then says what is wrong', async () => {
      const { deps, rasterFallback } = pdfSetup([pageOf([['a', [square]]]), null]);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { report } = await exportPagesPdf(pdfOptions({ pageCount: 2 }), deps);

      expect(rasterFallback).toHaveBeenCalledTimes(1);
      expect(report.fallback?.reason).toContain('Seite 2');
      vi.restoreAllMocks();
    });

    it('if the raster pdf fails too, that is the error', async () => {
      const { deps, rasterFallback } = pdfSetup([pageOf([['a', [square]]])]);
      vi.mocked(writePdf).mockRejectedValueOnce(new Error('vector failed'));
      rasterFallback.mockRejectedValueOnce(new Error('raster failed'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(exportPagesPdf(pdfOptions(), deps)).rejects.toThrow('raster failed');
      vi.restoreAllMocks();
    });
  });
});
