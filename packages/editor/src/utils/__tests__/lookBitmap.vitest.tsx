// SPDX-License-Identifier: AGPL-3.0-only
import { createCanvas } from '@napi-rs/canvas';
import Konva from 'konva';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installNapiStageBridge } from '../../testing/napiStageBridge.js';
import { getActiveImageFilters, imageFilterAttrs, VignetteFilter } from '../imageFilters.js';
import {
  drawsLook,
  LOOK_IMAGE_ATTR,
  lookBitmap,
  lookBitmapSize,
  lookDrawAttrs,
  lookKey,
  lookSceneFunc,
  paintVignette,
} from '../lookBitmap.js';

import type { ImageAdjustments } from '../userImageUtils.js';

let restore: () => void;
beforeAll(() => {
  restore = installNapiStageBridge();
});
afterAll(() => restore());

/** A photo with colour in every direction, so a mirror or a misplaced crop shows. */
function makePhoto(width = 300, height = 200, alphaHole = false): HTMLImageElement {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#e63946');
  gradient.addColorStop(0.5, '#f1c40f');
  gradient.addColorStop(1, '#1d3557');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#2a9d8f';
  ctx.fillRect(width * 0.1, height * 0.15, width * 0.2, height * 0.3);
  if (alphaHole) ctx.clearRect(width * 0.6, height * 0.5, width * 0.3, height * 0.4);
  return Object.assign(canvas, { naturalWidth: width, naturalHeight: height }) as never;
}

function pixelsOf(canvas: { width: number; height: number; getContext(id: '2d'): unknown }) {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function maxDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  expect(a.length).toBe(b.length);
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!));
  return max;
}

/** Draws `node` alone on a stage at device ratio 1 and returns its pixels. */
function render(node: Konva.Image, width: number, height: number): Uint8ClampedArray {
  const stage = new Konva.Stage({ container: document.createElement('div'), width, height });
  const layer = new Konva.Layer();
  stage.add(layer);
  layer.getCanvas().setPixelRatio(1);
  layer.add(node);
  layer.draw();
  const ctx = layer.getContext()._context as CanvasRenderingContext2D;
  const data = ctx.getImageData(0, 0, width, height).data;
  stage.destroy();
  return data;
}

describe('lookBitmapSize', () => {
  const natural = { width: 4000, height: 3000 };

  it('is the drawn size at the pixel ratio', () => {
    expect(lookBitmapSize(natural, 1000, 2)).toEqual({ width: 2000, height: 1500 });
  });

  it('is never larger than the photo', () => {
    expect(lookBitmapSize(natural, 1000, 10)).toEqual(natural);
  });

  it('stays within the area limit', () => {
    const size = lookBitmapSize(natural, 4000, 1, 1_000_000);
    expect(size.width * size.height).toBeLessThanOrEqual(1_001_000);
    expect(size.width / size.height).toBeCloseTo(4 / 3, 2);
  });
});

describe('lookKey and drawsLook', () => {
  it('has no bitmap for a look without colour filters, but draws a flip or a vignette', () => {
    expect(lookKey({}, null)).toBeNull();
    expect(lookKey({ flipX: true, vignette: 0.5 }, null)).toBeNull();
    expect(drawsLook({}, null)).toBe(false);
    expect(drawsLook({ flipX: true }, null)).toBe(true);
    expect(drawsLook({ vignette: 0.4 }, null)).toBe(true);
  });

  it('tells colour looks apart, the switches included, and ignores flip and vignette', () => {
    const grayscale = lookKey({ grayscale: true }, null);
    expect(grayscale).not.toBeNull();
    expect(lookKey({ sepia: true }, null)).not.toBe(grayscale);
    expect(lookKey({ grayscale: true, flipY: true, vignette: 1 }, null)).toBe(grayscale);
    expect(lookKey(null, '#ff0000')).not.toBeNull();
  });
});

describe('lookBitmap', () => {
  it('is the photo itself when there is nothing to filter', () => {
    const photo = makePhoto();
    expect(lookBitmap(photo, { flipX: true }, null, 300, { width: 300, height: 200 })).toBe(photo);
  });

  it('builds a look once and reuses it for a draw of the same size or smaller', () => {
    const photo = makePhoto();
    const look: ImageAdjustments = { grayscale: true };
    const first = lookBitmap(photo, look, null, 300, { width: 300, height: 200 });
    expect(first).not.toBe(photo);
    expect(lookBitmap(photo, { ...look }, null, 300, { width: 150, height: 100 })).toBe(first);
    expect(lookBitmap(photo, { sepia: true }, null, 300, { width: 300, height: 200 })).not.toBe(
      first
    );
  });

  it('holds the same pixels the filters produced over the cache', () => {
    const photo = makePhoto();
    const look: ImageAdjustments = { brightness: 0.2, contrast: 15, saturation: 0.5, sepia: true };
    const bitmap = lookBitmap(photo, look, null, 300, { width: 300, height: 200 });

    const expected = createCanvas(300, 200);
    const ctx = expected.getContext('2d');
    ctx.drawImage(photo as never, 0, 0);
    const data = ctx.getImageData(0, 0, 300, 200);
    const attrs = new Konva.Image({ image: photo, ...imageFilterAttrs(look) });
    for (const filter of getActiveImageFilters(look)) {
      if (typeof filter === 'function') filter.call(attrs, data as unknown as ImageData, 1);
    }
    expect(maxDiff(pixelsOf(bitmap as HTMLCanvasElement), data.data)).toBe(0);
  });
});

describe('paintVignette', () => {
  it('darkens like the vignette filter did', () => {
    const photo = makePhoto(240, 160);
    const viaFilter = createCanvas(240, 160);
    const filterCtx = viaFilter.getContext('2d');
    filterCtx.drawImage(photo as never, 0, 0);
    const data = filterCtx.getImageData(0, 0, 240, 160);
    const vignette = VignetteFilter as (this: Konva.Node, data: ImageData) => void;
    vignette.call(
      new Konva.Image({ image: undefined, vignette: 0.8 }),
      data as unknown as ImageData
    );

    const viaPaint = createCanvas(240, 160);
    const paintCtx = viaPaint.getContext('2d');
    paintCtx.drawImage(photo as never, 0, 0);
    paintVignette(paintCtx as unknown as CanvasRenderingContext2D, 240, 160, 0.8);

    // The gradient is drawn in 8-bit alpha and blended premultiplied: a few levels of 255.
    expect(maxDiff(pixelsOf(viaPaint), data.data)).toBeLessThanOrEqual(4);
  });

  it('keeps transparent pixels transparent', () => {
    const photo = makePhoto(240, 160, true);
    const canvas = createCanvas(240, 160);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(photo as never, 0, 0);
    paintVignette(ctx as unknown as CanvasRenderingContext2D, 240, 160, 1);
    // A corner inside the hole: full vignette strength, still no paint.
    const corner = ctx.getImageData(210, 140, 1, 1).data;
    expect(corner[3]).toBe(0);
  });
});

describe('lookSceneFunc against the filtered cache', () => {
  // The former path: Konva filters over a cache of the cropped node, flip and vignette included.
  function filteredByCache(photo: HTMLImageElement, look: ImageAdjustments, crop: Konva.IRect) {
    const node = new Konva.Image({
      image: photo,
      x: 10,
      y: 10,
      width: 200,
      height: 120,
      crop,
      filters: getActiveImageFilters(look),
      ...imageFilterAttrs(look),
    });
    node.cache({ pixelRatio: 1 });
    return render(node, 220, 140);
  }

  function drawnFromBitmap(photo: HTMLImageElement, look: ImageAdjustments, crop: Konva.IRect) {
    const node = new Konva.Image({
      image: photo,
      x: 10,
      y: 10,
      width: 200,
      height: 120,
      crop,
      sceneFunc: lookSceneFunc,
      ...lookDrawAttrs(look),
    });
    // 150 of 300 photo px fill 200 node units: the whole photo is drawn 400 units wide.
    const photoWidth = (photo.naturalWidth * 200) / crop.width;
    node.setAttr(
      LOOK_IMAGE_ATTR,
      lookBitmap(photo, look, null, photoWidth, { width: 300, height: 200 })
    );
    return render(node, 220, 140);
  }

  const crop = { x: 60, y: 40, width: 150, height: 90 };

  it.each<[string, ImageAdjustments]>([
    ['grayscale with vignette', { grayscale: true, contrast: 6, vignette: 0.7 }],
    ['tint, flipped both ways', { tintStrength: 0.8, tint: '#46962b', flipX: true, flipY: true }],
    ['warm, flipped left–right, with vignette', { temperature: 40, flipX: true, vignette: 0.5 }],
  ])('draws %s like the cache did', (_name, look) => {
    const photo = makePhoto();
    expect(
      maxDiff(drawnFromBitmap(photo, look, crop), filteredByCache(photo, look, crop))
    ).toBeLessThanOrEqual(4);
  });
});
