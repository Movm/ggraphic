// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The render gate's pixel comparison of an export with the canvas it was made from, with the
 * antialiasing allowed for.
 *
 * Two renderers never antialias an edge alike: Chromium draws text on a canvas with its own
 * gamma and contrast, a glyph as a path gets plain coverage, and pdf.js has a rasteriser of its
 * own. A strict pixel-by-pixel count therefore charges every glyph edge as a difference, and the
 * more text (or the more contrast: white on dark) a page has, the more it charges. What the gate
 * looks for is a different shape, a different place, a different colour or a missing element.
 *
 * So a pixel differs only if no pixel of the other picture within one pixel of it (the 3x3
 * neighbourhood of the same position) is within the tolerance of it. That is checked both ways,
 * canvas against export and export against canvas, and the pixels that fail either way are
 * counted once. An edge that is off by a pixel passes; a glyph that is two pixels off, or is
 * missing, does not.
 *
 * Plain arrays in and out, so a test in jsdom and the gate page share it. Gate only (it is
 * imported by `main.tsx`, which puts it on `window.__gateCompare`).
 */
export interface PixelComparison {
  /** Pixels some channel of which is off by more than the tolerance from the pixel at the same place. */
  strict: number;
  /** Pixels that stay off after the neighbourhood is allowed for, in either direction. */
  differing: number;
  /** The largest channel delta between pixels at the same place. */
  maxDelta: number;
  /** The bounding box of the `differing` pixels (inclusive), or null when there are none. */
  box: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** The `differing` pixels per tenth of the height, top to bottom. */
  bands: number[];
  /**
   * RGBA, same size: red where `differing`, orange where only `strict` (an edge the neighbourhood
   * allowed for), the first image faded to a third elsewhere.
   */
  diff: Uint8ClampedArray<ArrayBuffer>;
}

const BANDS = 10;

/** The largest difference of the red, green and blue channels of pixel `ai` of `a` and `bi` of `b`. */
function channelDelta(a: Uint8ClampedArray, ai: number, b: Uint8ClampedArray, bi: number): number {
  return Math.max(
    Math.abs(a[ai]! - b[bi]!),
    Math.abs(a[ai + 1]! - b[bi + 1]!),
    Math.abs(a[ai + 2]! - b[bi + 2]!)
  );
}

/** Whether every pixel of `to` within one pixel of (`x`, `y`) is off by more than `tolerance` from `from`'s pixel there. */
function offFromAllNeighbours(
  from: Uint8ClampedArray,
  to: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  height: number,
  tolerance: number
): boolean {
  const at = (y * width + x) * 4;
  for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
    for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
      if (channelDelta(from, at, to, (ny * width + nx) * 4) <= tolerance) return false;
    }
  }
  return true;
}

/**
 * Compares two RGBA buffers of `width` x `height`; `tolerance` is the largest channel delta that
 * still counts as the same colour (0 to 255).
 */
export function comparePixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number
): PixelComparison {
  const length = width * height * 4;
  if (a.length !== length || b.length !== length) {
    throw new RangeError(
      `expected ${length} bytes for ${width}x${height}, got ${a.length}/${b.length}`
    );
  }
  const diff = new Uint8ClampedArray(length);
  const bands = new Array<number>(BANDS).fill(0);
  let strict = 0;
  let differing = 0;
  let maxDelta = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let at = 0; at < length; at += 4) {
    const delta = channelDelta(a, at, b, at);
    if (delta > maxDelta) maxDelta = delta;
    // The canvas, faded to a third, so the picture shows where the differences are on the page.
    const grey = 0.3 * a[at]! + 0.59 * a[at + 1]! + 0.11 * a[at + 2]!;
    const faded = 255 - (255 - grey) / 3;
    diff[at] = diff[at + 1] = diff[at + 2] = faded;
    diff[at + 3] = 255;
    // The same place is the nearest neighbour: a pixel that matches there needs no search.
    if (delta <= tolerance) continue;
    strict += 1;
    const pixel = at / 4;
    const x = pixel % width;
    const y = (pixel - x) / width;
    if (
      offFromAllNeighbours(a, b, x, y, width, height, tolerance) ||
      offFromAllNeighbours(b, a, x, y, width, height, tolerance)
    ) {
      differing += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      bands[Math.min(BANDS - 1, Math.floor((y * BANDS) / height))]! += 1;
      diff[at] = 255;
      diff[at + 1] = 0;
      diff[at + 2] = 0;
    } else {
      diff[at] = 255;
      diff[at + 1] = 170;
      diff[at + 2] = 0;
    }
  }
  return {
    strict,
    differing,
    maxDelta,
    box: differing > 0 ? { minX, minY, maxX, maxY } : null,
    bands,
    diff,
  };
}
