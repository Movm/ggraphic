// SPDX-License-Identifier: AGPL-3.0-only
// The branches the differential cannot reach, because Konva never draws them: raster islands, and
// images that arrive as decoded sources. Pixels are read back from a napi canvas.
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import { IDENTITY } from './matrix.js';
import { replayScene } from './replayScene.js';

import type { RecordedScene, SceneImageSource, SceneOp } from './types.js';

const base = { matrix: IDENTITY, alpha: 1, clips: [], shadow: null } as const;

const square = (hex: string): SceneOp => ({
  ...base,
  kind: 'path',
  mode: 'fill',
  commands: [
    { op: 'M', x: 0, y: 0 },
    { op: 'L', x: 4, y: 0 },
    { op: 'L', x: 4, y: 4 },
    { op: 'L', x: 0, y: 4 },
    { op: 'Z' },
  ],
  rule: 'nonzero',
  paint: { type: 'solid', hex, alpha: 1 },
  stroke: null,
});

const sceneOf = (...ops: SceneOp[]): RecordedScene => ({
  width: 8,
  height: 8,
  items: [{ elementId: 'a', label: null, ops }],
  report: {
    rasterIslands: [],
    unknownCalls: [],
    missingElements: [],
    missingGlyphs: [],
    outlinedForLicence: [],
    defaultInstanceFonts: [],
    rgbBrandColors: [],
    fallback: null,
  },
});

function pixelAt(canvas: Canvas, x: number, y: number) {
  return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
}

function replay(scene: RecordedScene, options: Parameters<typeof replayScene>[2] = {}) {
  const canvas = createCanvas(8, 8);
  replayScene(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, scene, options);
  return canvas;
}

/** A 2x2 solid source canvas, standing in for a decoded image. */
function solid(color: string) {
  const source = createCanvas(2, 2);
  const ctx = source.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 2, 2);
  return source as unknown as CanvasImageSource;
}

const raster = (extra: Partial<Extract<SceneOp, { kind: 'raster' }>>): SceneOp => ({
  ...base,
  kind: 'raster',
  png: null,
  x: 0,
  y: 0,
  width: 4,
  height: 4,
  reason: 'filter',
  source: null,
  ...extra,
});

describe('replayScene', () => {
  it('draws only the items the filter accepts', () => {
    const scene = sceneOf(square('#ff0000'));
    expect(pixelAt(replay(scene, { items: () => false }), 1, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(replay(scene, { items: (item) => item.elementId === 'a' }), 1, 1)).toEqual([
      255, 0, 0, 255,
    ]);
  });

  it('leaves the context as it found it', () => {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.globalAlpha = 0.5;
    ctx.translate(3, 0);
    replayScene(
      ctx as unknown as CanvasRenderingContext2D,
      sceneOf({ ...square('#ff0000'), alpha: 0.2, matrix: [2, 0, 0, 2, 0, 0] })
    );
    expect(ctx.globalAlpha).toBe(0.5);
    expect(ctx.getTransform().e).toBe(3);
  });

  it('draws the decoded png of a raster op, and its source ops when there is none', () => {
    const png = new Uint8Array([1, 2, 3]);
    const decoded = solid('#00ff00');
    const withPng = sceneOf(raster({ png, source: [square('#ff0000')] }));
    expect(pixelAt(replay(withPng, { images: new Map([[png, decoded]]) }), 1, 1)).toEqual([
      0, 255, 0, 255,
    ]);
    // The bytes were not decoded by the caller: the source ops stand in.
    expect(pixelAt(replay(withPng), 1, 1)).toEqual([255, 0, 0, 255]);
    // Neither: nothing to draw.
    expect(pixelAt(replay(sceneOf(raster({}))), 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it('draws an svg or bitmap image from the decoded sources it is given, and skips one it is not', () => {
    const svg: SceneImageSource = { kind: 'svg', markup: '<svg/>', width: 2, height: 2 };
    const image: SceneOp = {
      ...base,
      kind: 'image',
      image: svg,
      sx: 0,
      sy: 0,
      sw: 2,
      sh: 2,
      dx: 2,
      dy: 2,
      dw: 4,
      dh: 4,
    };
    const scene = sceneOf(image);
    expect(pixelAt(replay(scene, { images: new Map([[svg, solid('#0000ff')]]) }), 3, 3)).toEqual([
      0, 0, 255, 255,
    ]);
    expect(pixelAt(replay(scene), 3, 3)).toEqual([0, 0, 0, 0]);
  });

  it('composites a group from a buffer, with the alpha of the group', () => {
    const group: SceneOp = {
      ...base,
      kind: 'group',
      alpha: 0.5,
      ops: [square('#ff0000'), { ...square('#ff0000') }],
    };
    const [r, g, b, a] = pixelAt(
      replay(sceneOf(group), { createCanvas: (w, h) => createCanvas(w, h) as never }),
      1,
      1
    );
    // Two opaque squares in the buffer, then half of that onto the page: not 75 % from two halves.
    expect([r, g, b]).toEqual([255, 0, 0]);
    expect(a).toBeCloseTo(128, -1);
  });
});
