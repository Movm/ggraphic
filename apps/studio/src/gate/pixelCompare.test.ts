// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { comparePixels } from './pixelCompare';

const WIDTH = 80;
const HEIGHT = 60;
const TOLERANCE = 25;

/** A white picture with black rectangles `[x, y, width, height]`, as RGBA. */
function picture(...shapes: [number, number, number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(255);
  for (const [x0, y0, w, h] of shapes) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const at = (y * WIDTH + x) * 4;
        data[at] = data[at + 1] = data[at + 2] = 0;
      }
    }
  }
  return data;
}

/** A glyph-sized shape: a stem and a foot. */
const letter = (dx = 0, dy = 0): [number, number, number, number][] => [
  [10 + dx, 8 + dy, 6, 40],
  [10 + dx, 42 + dy, 24, 6],
];

const compare = (a: Uint8ClampedArray, b: Uint8ClampedArray, tolerance = TOLERANCE) =>
  comparePixels(a, b, WIDTH, HEIGHT, tolerance);

describe('comparePixels', () => {
  it('finds nothing in two equal pictures', () => {
    const result = compare(picture(...letter()), picture(...letter()));
    expect(result).toMatchObject({ strict: 0, differing: 0, maxDelta: 0, box: null });
    expect(result.bands.every((count) => count === 0)).toBe(true);
  });

  it('lets an edge that is one pixel off pass, in either direction, and still counts it strictly', () => {
    // The stem one pixel wider on the right, and one pixel narrower: an antialiased edge.
    const stem = picture([10, 8, 6, 40]);
    for (const other of [picture([10, 8, 7, 40]), picture([10, 8, 5, 40])]) {
      for (const [a, b] of [
        [stem, other],
        [other, stem],
      ] as const) {
        const result = compare(a, b);
        expect(result.strict).toBe(40);
        expect(result.differing).toBe(0);
        expect(result.box).toBeNull();
      }
    }
  });

  it('lets a whole glyph that is one pixel off in any direction pass', () => {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 1],
      [1, -1],
    ] as const) {
      const result = compare(picture(...letter()), picture(...letter(dx, dy)));
      expect(result.strict).toBeGreaterThan(0);
      expect(result.differing).toBe(0);
    }
  });

  it('counts a glyph that is two pixels off', () => {
    const result = compare(picture(...letter()), picture(...letter(2, 0)));
    // The left column of the stem in one picture and the right column in the other: 40 rows each,
    // and the ends of the foot.
    expect(result.differing).toBeGreaterThanOrEqual(80);
    expect(result.box).toMatchObject({ minX: 10, maxX: 35 });
    expect(result.strict).toBeGreaterThan(result.differing);
  });

  it('counts a glyph that is missing from one picture, whichever one', () => {
    const area = 6 * 40 + 24 * 6 - 6 * 6;
    expect(compare(picture(...letter()), picture()).differing).toBe(area);
    expect(compare(picture(), picture(...letter())).differing).toBe(area);
  });

  it('counts a pixel once when both directions find it off', () => {
    // A single black pixel against a white picture is off from every neighbour, both ways.
    const result = compare(picture([30, 30, 1, 1]), picture());
    expect(result.strict).toBe(1);
    expect(result.differing).toBe(1);
  });

  it('keeps the tolerance: a channel delta of 25 is the same colour, 26 is not', () => {
    const grey = (value: number) => {
      const data = picture();
      for (let at = 0; at < data.length; at += 4) data[at] = data[at + 1] = data[at + 2] = value;
      return data;
    };
    expect(compare(grey(255), grey(230)).differing).toBe(0);
    expect(compare(grey(255), grey(230)).strict).toBe(0);
    expect(compare(grey(255), grey(229)).differing).toBe(WIDTH * HEIGHT);
    expect(compare(grey(255), grey(229)).maxDelta).toBe(26);
  });

  it('does not let a different colour pass because the shape is where it should be', () => {
    const lighter = picture(...letter());
    for (let at = 0; at < lighter.length; at += 4) {
      if (lighter[at] === 0) lighter[at] = lighter[at + 1] = lighter[at + 2] = 120;
    }
    expect(compare(picture(...letter()), lighter).differing).toBeGreaterThan(0);
  });

  it('boxes the differing pixels and spreads them over the tenths of the height', () => {
    const result = compare(picture([20, 30, 5, 5]), picture());
    expect(result.box).toEqual({ minX: 20, minY: 30, maxX: 24, maxY: 34 });
    // Rows 30 to 34 of 60 are the sixth tenth.
    expect(result.bands).toEqual([0, 0, 0, 0, 0, 25, 0, 0, 0, 0]);
  });

  it('paints the diff: red where it differs, orange where the neighbourhood allowed it', () => {
    const colourAt = (diff: Uint8ClampedArray, x: number, y: number) =>
      Array.from(diff.slice((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4));
    const near = compare(picture(...letter()), picture(...letter(1, 0)));
    // The left column of the stem is only in the first picture, one pixel from a black one.
    expect(colourAt(near.diff, 10, 20)).toEqual([255, 170, 0, 255]);
    const missing = compare(picture(...letter()), picture());
    expect(colourAt(missing.diff, 10, 20)).toEqual([255, 0, 0, 255]);
    // Elsewhere the first picture, faded: white stays white.
    expect(colourAt(missing.diff, 70, 5)).toEqual([255, 255, 255, 255]);
  });

  it('refuses buffers of the wrong size', () => {
    expect(() =>
      comparePixels(picture(), new Uint8ClampedArray(8), WIDTH, HEIGHT, TOLERANCE)
    ).toThrow(RangeError);
  });
});
