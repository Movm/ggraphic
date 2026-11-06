// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { diffPixels } from './pixelDiff.js';

const image = (pixels: number[][]) => new Uint8ClampedArray(pixels.flat());

describe('diffPixels', () => {
  const a = image([
    [10, 10, 10, 255],
    [20, 20, 20, 255],
    [30, 30, 30, 255],
    [40, 40, 40, 255],
  ]);

  it('finds nothing in identical images', () => {
    const diff = diffPixels(a, a.slice(), 2, 2, 0);
    expect(diff).toMatchObject({ differing: 0, share: 0, box: null });
  });

  it('counts a pixel when a channel differs by more than the tolerance, alpha included', () => {
    const b = a.slice();
    b[0] = 10 + 8; // exactly the tolerance: same
    b[5] = 20 + 9; // one more: different
    b[15] = 255 - 9; // alpha of the last pixel
    const diff = diffPixels(a, b, 2, 2, 8);
    expect(diff.differing).toBe(2);
    expect(diff.share).toBe(0.5);
    expect(diff.box).toEqual({ x: 1, y: 0, width: 1, height: 2 });
  });

  it('paints the differing pixels red in the diff image', () => {
    const b = a.slice();
    b[8] = 200;
    const { diffRgba } = diffPixels(a, b, 2, 2, 0);
    expect([...diffRgba.slice(8, 12)]).toEqual([255, 0, 0, 255]);
    expect(diffRgba[0]).toBe(diffRgba[1]);
  });

  it('refuses buffers of the wrong size', () => {
    expect(() => diffPixels(a, a.slice(0, 8), 2, 2, 0)).toThrow(RangeError);
  });
});
