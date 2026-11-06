// SPDX-License-Identifier: AGPL-3.0-only
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import { rasterizeOps, type CreateSurface, type RasterSurface } from './browserDeps.js';
import { IDENTITY } from './matrix.js';
import type { SceneOp } from './types.js';

/** A surface on `@napi-rs/canvas`, which draws for real in node. */
const napiSurface: CreateSurface = (width, height) => {
  const canvas = createCanvas(width, height);
  return {
    canvas: canvas as unknown as RasterSurface['canvas'],
    context: canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
    encode: async () => new Uint8Array(canvas.encodeSync('png')),
  };
};

const base = { alpha: 1, clips: [], shadow: null } as const;

/** A red 10 px square whose corner is at (x, y) in the space of `matrix`. */
const red = (x: number, y: number, matrix: SceneOp['matrix'] = IDENTITY): SceneOp => ({
  ...base,
  matrix,
  kind: 'path',
  mode: 'fill',
  commands: [
    { op: 'M', x, y },
    { op: 'L', x: x + 10, y },
    { op: 'L', x: x + 10, y: y + 10 },
    { op: 'L', x, y: y + 10 },
    { op: 'Z' },
  ],
  rule: 'nonzero',
  paint: { type: 'solid', hex: '#ff0000', alpha: 1 },
  stroke: null,
});

async function pixels(png: Uint8Array) {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  return {
    width: image.width,
    height: image.height,
    at: (x: number, y: number) => [
      ...data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
    ],
  };
}

const BOX = { x: 40, y: 40, width: 30, height: 30 };

describe('rasterizeOps', () => {
  it('draws the box of the page at the pixel ratio, ops placed by where they sit in the page', async () => {
    const png = await rasterizeOps([red(50, 50)], BOX, 2, napiSurface);

    const image = await pixels(png!);
    expect([image.width, image.height]).toEqual([60, 60]);
    // The square is page px 50..60: output px 20..40.
    expect(image.at(21, 21)).toEqual([255, 0, 0, 255]);
    expect(image.at(38, 38)).toEqual([255, 0, 0, 255]);
    expect(image.at(10, 10)[3]).toBe(0);
    expect(image.at(45, 45)[3]).toBe(0);
  });

  it('places the children of a group by the group matrix as well', async () => {
    // Drawn at 45 in the group's space, which sits 5 px right of the page's: page px 50..60.
    const group: SceneOp = {
      ...base,
      matrix: [1, 0, 0, 1, 5, 0],
      kind: 'group',
      ops: [red(45, 50)],
    };

    const png = await rasterizeOps([group], BOX, 2, napiSurface);

    const image = await pixels(png!);
    expect(image.at(21, 21)).toEqual([255, 0, 0, 255]);
    expect(image.at(38, 38)).toEqual([255, 0, 0, 255]);
    expect(image.at(10, 10)[3]).toBe(0);
    expect(image.at(45, 45)[3]).toBe(0);
  });

  it('answers null for an empty box or a canvas it cannot get', async () => {
    expect(await rasterizeOps([red(50, 50)], { ...BOX, width: 0 }, 2, napiSurface)).toBeNull();
    expect(await rasterizeOps([red(50, 50)], BOX, 2, () => null)).toBeNull();
  });
});
