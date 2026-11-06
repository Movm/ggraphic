// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Compares two RGBA buffers of the same size: how many pixels differ by more than a tolerance in
 * any channel, and an image that shows where. Plain data in and out, so a test in node, jsdom or a
 * browser can use it; encoding the diff image is up to the caller.
 */
export interface PixelDiff {
  /** Pixels where some channel (alpha included) differs by more than the tolerance. */
  differing: number;
  /** `differing` as a share of all pixels, 0..1. */
  share: number;
  /** RGBA, same size: red where the pixels differ, the first image faded grey elsewhere. */
  diffRgba: Uint8ClampedArray;
  /** The bounding box of the differing pixels, or null when there are none. */
  box: { x: number; y: number; width: number; height: number } | null;
}

export function diffPixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  channelTolerance: number
): PixelDiff {
  const length = width * height * 4;
  if (a.length !== length || b.length !== length) {
    throw new RangeError(
      `expected ${length} bytes for ${width}×${height}, got ${a.length}/${b.length}`
    );
  }
  const diffRgba = new Uint8ClampedArray(length);
  let differing = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < length; i += 4) {
    const worst = Math.max(
      Math.abs(a[i]! - b[i]!),
      Math.abs(a[i + 1]! - b[i + 1]!),
      Math.abs(a[i + 2]! - b[i + 2]!),
      Math.abs(a[i + 3]! - b[i + 3]!)
    );
    if (worst > channelTolerance) {
      differing += 1;
      const pixel = i / 4;
      const x = pixel % width;
      const y = (pixel - x) / width;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      diffRgba[i] = 255;
      diffRgba[i + 3] = 255;
    } else {
      const grey = Math.round((a[i]! + a[i + 1]! + a[i + 2]!) / 3 / 4 + 190);
      diffRgba[i] = grey;
      diffRgba[i + 1] = grey;
      diffRgba[i + 2] = grey;
      diffRgba[i + 3] = 255;
    }
  }
  return {
    differing,
    share: differing / (width * height),
    diffRgba,
    box: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}
