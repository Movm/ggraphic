// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { fitPixelRatio, MAX_RASTER_PIXELS } from './rasterLimit.js';

const cost = (w: number, h: number, r: number) => (Math.ceil(w * r) + 2) * (Math.ceil(h * r) + 2);

describe('fitPixelRatio', () => {
  it('leaves a box inside the limit alone', () => {
    expect(fitPixelRatio(100, 100, 2)).toEqual({ pixelRatio: 2, reduced: false });
  });

  it('keeps the budgeted pixels within the limit for any size, including awkward fractions', () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 2000; i++) {
      const w = 50 + next() * 4000;
      const h = 50 + next() * 4000;
      const fitted = fitPixelRatio(w, h, 1 + next() * 8);
      expect(cost(w, h, fitted.pixelRatio)).toBeLessThanOrEqual(MAX_RASTER_PIXELS);
    }
  });

  it('holds at the edge: a ratio that just fits is untouched, one step over is reduced', () => {
    const w = 4096;
    const h = 4096 - 4;
    const r = 1;
    const edge = fitPixelRatio(w, h, r);
    expect(cost(w, h, edge.pixelRatio)).toBeLessThanOrEqual(MAX_RASTER_PIXELS);
    const over = fitPixelRatio(w, h, 1.0002);
    expect(over.reduced).toBe(true);
    expect(cost(w, h, over.pixelRatio)).toBeLessThanOrEqual(MAX_RASTER_PIXELS);
  });
});
