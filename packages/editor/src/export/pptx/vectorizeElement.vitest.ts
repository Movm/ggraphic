// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  base,
  bitmap,
  fill,
  item,
  rect,
  solid,
  svgImage,
  textOp,
} from '../scene/__fixtures__/exportSceneFixture.js';
import { emptyReport, type RecordedScene, type SceneItem, type SceneOp } from '../scene/types.js';
import { createVectorizer } from './vectorizeElement.js';

import type { PptxRasterRequest } from './types.js';
import type { ResolveDeps } from '../scene/resolveScene.js';
import type { VectorExportDeps } from '../vectorExport.js';

const fontsourceDir = path.dirname(
  createRequire(import.meta.url).resolve('@fontsource/instrument-sans/package.json')
);
const latinBytes = new Uint8Array(
  readFileSync(path.join(fontsourceDir, 'files', 'instrument-sans-latin-400-normal.woff2'))
);

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const red = solid('#ff0000');

const request = (elementId: string): PptxRasterRequest => ({
  kind: 'raster',
  elementId,
  box: { x: 0, y: 0, width: 10, height: 10 },
  rotation: 30,
  reason: 'shape-path',
  boxExact: true,
});

const sceneOfItems = (...items: SceneItem[]): RecordedScene => ({
  width: 1000,
  height: 500,
  items,
  report: emptyReport(),
});

function setup(slides: (RecordedScene | null)[], over: Partial<VectorExportDeps> = {}) {
  const recordPage = vi.fn(
    async (index: number, _options: { transparent: boolean }) => slides[index] ?? null
  );
  const fetchBytes = vi.fn(async (_url: string) => latinBytes);
  const resolveDeps = (page: number): ResolveDeps => ({
    page,
    fetchBytes: async () => null,
    reencode: async () => null,
    rasterizeElement: async () => null,
    rasterizeNode: async () => null,
    rasterizeOps: async () => null,
    rasterPixelRatio: 2,
  });
  const deps: VectorExportDeps = {
    recordPage,
    resolveDeps,
    fontDeps: { brandFaces: [{ family: 'Instrument Sans', src: 'latin.woff2' }], fetchBytes },
    ...over,
  };
  return { vectorize: createVectorizer(deps), recordPage, fetchBytes };
}

const raster: SceneOp = {
  ...base(),
  kind: 'raster',
  png: PNG,
  source: null,
  x: 0,
  y: 0,
  width: 5,
  height: 5,
  reason: 'filter',
};

describe('createVectorizer', () => {
  it('answers with the element alone, cropped to its bounds, and the box it covers', async () => {
    const { vectorize } = setup([
      sceneOfItems(
        item('other', null, fill(rect(0, 0, 900, 400), red)),
        item(
          'icon',
          'Icon',
          fill(rect(0, 0, 40, 30), solid('#00a050'), { matrix: [1, 0, 0, 1, 100, 200] })
        )
      ),
    ]);

    const answer = await vectorize(request('icon'), 0);

    expect(answer?.box).toEqual({ x: 100, y: 200, width: 40, height: 30 });
    expect(answer?.svg).toContain('viewBox="0 0 40 30"');
    expect(answer?.svg).toContain('data-element-id="icon"');
    expect(answer?.svg).toContain('#00a050');
    expect(answer?.svg).not.toContain('other');
    // The path starts at the crop's origin, not at its place on the page.
    expect(answer?.svg).toContain('M0 0L40 0L40 30L0 30Z');
    expect(answer?.svg).not.toContain('transform=');
  });

  it('draws the same element the same way wherever it sits', async () => {
    const at = (id: string, x: number, y: number) =>
      item(id, null, fill(rect(0, 0, 30, 30), red, { matrix: [1, 0, 0, 1, x, y] }));
    const { vectorize } = setup([sceneOfItems(at('one', 15, 15), at('two', 405, 305))]);

    const one = await vectorize(request('one'), 0);
    const two = await vectorize(request('two'), 0);

    expect(one?.box).toEqual({ x: 15, y: 15, width: 30, height: 30 });
    expect(two?.box).toEqual({ x: 405, y: 305, width: 30, height: 30 });
    const bare = (svg: string | undefined, id: string) =>
      svg?.replaceAll(`el-${id}`, 'el').replaceAll(`data-element-id="${id}"`, '');
    expect(bare(two?.svg, 'two')).toBe(bare(one?.svg, 'one'));
  });

  it('keeps a rotated element where the recording put it: the box is the rotated ink', async () => {
    const turned = fill(rect(0, 0, 100, 10), red, {
      matrix: [0, 1, -1, 0, 200, 100], // a quarter turn about (200, 100)
    });
    const { vectorize } = setup([sceneOfItems(item('bar', null, turned))]);

    const answer = await vectorize(request('bar'), 0);

    expect(answer?.box).toEqual({ x: 190, y: 100, width: 10, height: 100 });
  });

  it('records and resolves a slide once, however many elements ask, and only when asked', async () => {
    const slide = sceneOfItems(
      item('a', null, fill(rect(0, 0, 10, 10), red)),
      item('b', null, fill(rect(20, 0, 10, 10), red))
    );
    const { vectorize, recordPage } = setup([slide, slide]);

    expect(recordPage).not.toHaveBeenCalled();
    await Promise.all([vectorize(request('a'), 1), vectorize(request('b'), 1)]);
    await vectorize(request('a'), 1);

    expect(recordPage).toHaveBeenCalledTimes(1);
    expect(recordPage).toHaveBeenCalledWith(1, { transparent: false });
  });

  it('answers null for an element with a raster op, since that is not all vector', async () => {
    const grouped: SceneOp = { ...base(), kind: 'group', ops: [raster] };
    const { vectorize } = setup([
      sceneOfItems(
        item('photo', null, fill(rect(0, 0, 10, 10), red), raster),
        item('nested', null, grouped)
      ),
    ]);

    expect(await vectorize(request('photo'), 0)).toBeNull();
    expect(await vectorize(request('nested'), 0)).toBeNull();
  });

  it('answers null for an element the recording does not have, or no recording', async () => {
    const { vectorize } = setup([sceneOfItems(item('a', null, fill(rect(0, 0, 9, 9), red))), null]);

    expect(await vectorize(request('missing'), 0)).toBeNull();
    expect(await vectorize(request('a'), 1)).toBeNull();
  });

  it('answers null for an element that draws nothing', async () => {
    const { vectorize } = setup([sceneOfItems(item('empty', null))]);

    expect(await vectorize(request('empty'), 0)).toBeNull();
  });

  it('answers null, and does not throw, when the page cannot be recorded', async () => {
    const { vectorize } = setup([], {
      recordPage: async () => {
        throw new Error('stage gone');
      },
    });

    expect(await vectorize(request('a'), 0)).toBeNull();
  });

  it('draws text as outlines in the face the element uses, so no viewer needs the font', async () => {
    const { vectorize, fetchBytes } = setup([
      sceneOfItems(
        item(
          'label',
          null,
          textOp('Hi', {
            font: { family: 'Instrument Sans', weight: 400, style: 'normal', size: 40 },
          })
        )
      ),
    ]);

    const answer = await vectorize(request('label'), 0);

    expect(answer?.svg).toContain('<path');
    expect(answer?.svg).not.toContain('<text');
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('answers null rather than editable text when no font file covers the text', async () => {
    const { vectorize } = setup(
      [
        sceneOfItems(
          item(
            'label',
            null,
            textOp('Hi', {
              font: { family: 'Nobody Has This', weight: 400, style: 'normal', size: 40 },
            })
          )
        ),
      ],
      { fontDeps: {} }
    );

    expect(await vectorize(request('label'), 0)).toBeNull();
  });

  it('answers null for a picture whose own text a viewer would set in a font of its own', async () => {
    const chart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><text x="1" y="10">Jan</text></svg>`;
    const { vectorize } = setup([sceneOfItems(item('chart', null, svgImage(chart)))]);

    expect(await vectorize(request('chart'), 0)).toBeNull();
  });

  it('keeps pictures: an svg icon is inlined and a bitmap embedded', async () => {
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M0 0h24v24H0z" fill="#00a050"/></svg>`;
    const frame: SceneOp = {
      ...base(),
      kind: 'image',
      image: bitmap(PNG, 8, 8),
      sx: 0,
      sy: 0,
      sw: 8,
      sh: 8,
      dx: 50,
      dy: 60,
      dw: 80,
      dh: 80,
    };
    const { vectorize } = setup([
      sceneOfItems(item('icon', null, svgImage(icon)), item('frame', null, frame)),
    ]);

    const viaSvg = await vectorize(request('icon'), 0);
    const viaBitmap = await vectorize(request('frame'), 0);

    expect(viaSvg?.svg).toContain('<svg x=');
    expect(viaSvg?.box).toEqual({ x: 10, y: 20, width: 48, height: 48 });
    expect(viaBitmap?.svg).toContain('data:image/png;base64,');
    expect(viaBitmap?.box).toEqual({ x: 50, y: 60, width: 80, height: 80 });
  });

  it('sizes the picture at twice the page px, so its png preview is as sharp as the raster was', async () => {
    const { vectorize } = setup([sceneOfItems(item('a', null, fill(rect(5, 5, 40, 30), red)))]);

    const answer = await vectorize(request('a'), 0);

    expect(answer?.svg).toMatch(/^<svg [^>]*viewBox="0 0 40 30" width="80" height="60">/);
  });
});
