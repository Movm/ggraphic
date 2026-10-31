// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { buildPptxModel } from './buildPptxModel.js';
import { shadeGradient } from '../../utils/shade.js';

import type { CanvasFormat } from '../../formats/index.js';
import type { ShapeInstance } from '../../utils/shapes.js';
import type { UserImageInstance } from '../../utils/userImageUtils.js';

const format = { width: 1080, height: 1350 } as unknown as CanvasFormat;

const shape = (extra: Partial<ShapeInstance> = {}): ShapeInstance => ({
  id: 's1',
  type: 'rect',
  x: 0,
  y: 700,
  width: 1080,
  height: 650,
  fill: '#005538',
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  ...extra,
});

const items = (s: ShapeInstance) =>
  buildPptxModel([{ shapeInstances: [s] }], format).slides[0]!.items;

describe('buildPptxModel shade shapes', () => {
  it('exports a shade shape exactly like a shape with the equivalent fillGradient', () => {
    const shaded = items(shape({ shade: 'bottom' }));
    const gradient = items(shape({ fillGradient: shadeGradient('#005538', 'bottom') }));
    expect(shaded).toEqual(gradient);
    expect(shaded[0]).toMatchObject({ kind: 'raster', reason: 'shape-styled' });
  });

  it('a shape without shade is unchanged', () => {
    expect(items(shape())[0]).toMatchObject({ kind: 'shape', shape: 'rect', fill: '#005538' });
  });
});

describe('buildPptxModel duotone images', () => {
  const photo = (extra: Partial<UserImageInstance> = {}): UserImageInstance => ({
    id: 'p1',
    src: 'data:image/png;base64,AAAA',
    fileName: 'p.png',
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    rotation: 0,
    scale: 1,
    opacity: 1,
    ...extra,
  });
  const photoItems = (p: UserImageInstance) =>
    buildPptxModel([{ userImageInstances: [p] }], format).slides[0]!.items;

  it('a duotone image becomes a raster request, not a native picture', () => {
    expect(photoItems(photo({ duotoneLow: '#112233', duotoneHigh: '#ddeeff' }))[0]).toMatchObject({
      kind: 'raster',
      reason: 'image-adjusted',
    });
  });

  it('emits nothing for an image slot without a source', () => {
    expect(photoItems(photo({ src: '' }))).toEqual([]);
  });

  it('an image with one or no duotone colour stays a native picture', () => {
    expect(photoItems(photo())[0]).toMatchObject({ kind: 'image' });
    expect(photoItems(photo({ duotoneLow: '#112233' }))[0]).toMatchObject({ kind: 'image' });
    expect(photoItems(photo({ duotoneLow: null, duotoneHigh: null }))[0]).toMatchObject({
      kind: 'image',
    });
  });
});

describe('buildPptxModel notch', () => {
  it('rasterises a notched shape instead of exporting it un-notched', () => {
    expect(items(shape({ notch: 0.05 }))[0]).toMatchObject({
      kind: 'raster',
      reason: 'shape-styled',
    });
  });

  it('rasterises a notched image', () => {
    const image = {
      id: 'i1',
      src: 'https://assets.test/p.jpg',
      fileName: '',
      x: 0,
      y: 0,
      width: 600,
      height: 400,
      scale: 1,
      rotation: 0,
      opacity: 1,
      notch: 0.05,
    } as UserImageInstance;
    const out = buildPptxModel([{ userImageInstances: [image] }], format).slides[0]!.items;
    expect(out[0]).toMatchObject({ kind: 'raster' });
  });
});

describe('buildPptxModel glow', () => {
  it('rasterises a glow shape: pptx has no radial fade to alpha', () => {
    expect(items(shape({ type: 'ellipse', glow: true }))[0]).toMatchObject({
      kind: 'raster',
      reason: 'shape-styled',
    });
  });
});

describe('buildPptxModel per-corner radius', () => {
  it('rasterises a rounded-rect whose corners differ: roundRect rounds all four alike', () => {
    expect(items(shape({ type: 'rounded-rect', cornerRadius: [40, 0, 0, 0] }))[0]).toMatchObject({
      kind: 'raster',
      reason: 'shape-styled',
    });
  });

  it('keeps a rounded-rect with one radius native', () => {
    expect(items(shape({ type: 'rounded-rect', cornerRadius: 12 }))[0]).toMatchObject({
      kind: 'shape',
      rectRadius: 12,
    });
  });
});

describe('buildPptxModel texture', () => {
  it.each([
    ['grain', { grain: 0.3 }],
    ['dots', { pattern: 'dots' as const }],
    ['stripes', { pattern: 'stripes' as const }],
  ])('rasterises a rect with %s', (_name, extra) => {
    expect(items(shape(extra))[0]).toMatchObject({ kind: 'raster', reason: 'shape-styled' });
  });

  it('leaves a rect with grain 0 native', () => {
    expect(items(shape({ grain: 0 }))[0]).toMatchObject({ kind: 'shape' });
  });
});
