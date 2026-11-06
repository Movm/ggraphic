// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

import { IDENTITY } from './scene/matrix.js';
import type { ResolveDeps } from './scene/resolveScene.js';
import {
  emptyReport,
  type ExportReport,
  type FontSpec,
  type RecordedScene,
  type SceneOp,
} from './scene/types.js';
import { exportPagesSvg, type VectorExportDeps } from './vectorExport.js';

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
  const fetchBytes = vi.fn(async () => latinBytes);
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
