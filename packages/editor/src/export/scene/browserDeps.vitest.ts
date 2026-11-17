// SPDX-License-Identifier: AGPL-3.0-only
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';

import {
  rasterizeOps,
  type CreateSurface,
  type DecodeImage,
  type RasterSurface,
} from './browserDeps.js';
import { IDENTITY } from './matrix.js';
import type { SceneImageSource, SceneOp } from './types.js';

/** A surface on `@napi-rs/canvas`, which draws for real in node. */
const napiSurface: CreateSurface = (width, height) => {
  const canvas = createCanvas(width, height);
  return {
    canvas: canvas as unknown as RasterSurface['canvas'],
    context: canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
    encode: async () => new Uint8Array(canvas.encodeSync('png')),
  };
};

/** What the browser does with `createImageBitmap` and an `Image`, on napi: read the file. */
const napiDecode: DecodeImage = async (source) => {
  const bytes =
    source instanceof Uint8Array
      ? source
      : source.kind === 'svg'
        ? Buffer.from(source.markup)
        : source.bytes;
  return (await loadImage(Buffer.from(bytes))) as unknown as CanvasImageSource;
};

const base = { alpha: 1, clips: [], shadow: null } as const;

/** A red 10 px square whose corner is at (x, y) in the space of `matrix`. */
const red = (
  x: number,
  y: number,
  matrix: SceneOp['matrix'] = IDENTITY
): Extract<SceneOp, { kind: 'path' }> => ({
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

  describe('pictures in the ops', () => {
    const svg: SceneImageSource = {
      kind: 'svg',
      markup:
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#0000ff"/></svg>',
      width: 10,
      height: 10,
    };
    const image = (source: SceneImageSource, x: number, over: Partial<SceneOp> = {}): SceneOp =>
      ({
        ...base,
        matrix: IDENTITY,
        kind: 'image',
        image: source,
        sx: 0,
        sy: 0,
        sw: 10,
        sh: 10,
        dx: x,
        dy: 50,
        dw: 10,
        dh: 10,
        ...over,
      }) as SceneOp;

    it('draws an svg or a bitmap source once the browser has decoded it', async () => {
      // A blue square svg at page px 50..60.
      const png = await rasterizeOps([image(svg, 50)], BOX, 2, napiSurface, napiDecode);

      const picture = await pixels(png!);
      expect(picture.at(21, 21)).toEqual([0, 0, 255, 255]);
      expect(picture.at(45, 45)[3]).toBe(0);
    });

    it('draws the shadow of a picture, which the shadow island of a photo is', async () => {
      const shadowed = image(svg, 41, {
        shadow: { hex: '#000000', alpha: 1, blur: 0, offsetX: 20, offsetY: 0 },
      });
      const png = await rasterizeOps([shadowed], BOX, 1, napiSurface, napiDecode);

      // The picture at 41..51, its shadow 20 px right at 61..71: the box ends at 70.
      const picture = await pixels(png!);
      expect(picture.at(5, 15)).toEqual([0, 0, 255, 255]);
      expect(picture.at(25, 15)).toEqual([0, 0, 0, 255]);
    });

    it('draws a tile of a pattern and the pixels of a raster op', async () => {
      const swatch = createCanvas(4, 4);
      const context = swatch.getContext('2d');
      context.fillStyle = '#00ff00';
      context.fillRect(0, 0, 4, 4);
      const pixelsOf = new Uint8Array(swatch.encodeSync('png'));
      const tiled: SceneOp = {
        ...red(50, 50),
        paint: { type: 'pattern', image: svg, repeat: 'repeat', matrix: IDENTITY },
      };
      const raster: SceneOp = {
        ...base,
        matrix: IDENTITY,
        kind: 'raster',
        png: pixelsOf,
        x: 40,
        y: 40,
        width: 5,
        height: 5,
        reason: 'filter',
        source: null,
      };

      const png = await rasterizeOps([tiled, raster], BOX, 2, napiSurface, napiDecode);

      const picture = await pixels(png!);
      expect(picture.at(21, 21)).toEqual([0, 0, 255, 255]);
      expect(picture.at(4, 4)).toEqual([0, 255, 0, 255]);
    });

    it('decodes a source once however often the ops use it', async () => {
      const decode = vi.fn(napiDecode);

      await rasterizeOps([image(svg, 40), image(svg, 50)], BOX, 1, napiSurface, decode);

      expect(decode).toHaveBeenCalledTimes(1);
    });

    it('closes the bitmaps it has decoded when a later decode throws', async () => {
      const first = { close: vi.fn() };
      const other: SceneImageSource = { ...svg, markup: svg.markup.replace('#0000ff', '#00ff00') };
      const decode = vi
        .fn<DecodeImage>()
        .mockResolvedValueOnce(first as unknown as CanvasImageSource)
        .mockRejectedValueOnce(new Error('decoder failed'));

      await expect(
        rasterizeOps([image(svg, 40), image(other, 50)], BOX, 1, napiSurface, decode)
      ).rejects.toThrow('decoder failed');

      expect(first.close).toHaveBeenCalledTimes(1);
    });

    it('draws without the picture, and says nothing, when it cannot be decoded', async () => {
      const png = await rasterizeOps(
        [image(svg, 50), red(40, 40)],
        BOX,
        2,
        napiSurface,
        async () => null
      );

      const picture = await pixels(png!);
      expect(picture.at(5, 5)).toEqual([255, 0, 0, 255]);
      expect(picture.at(21, 21)[3]).toBe(0);
    });
  });
});
