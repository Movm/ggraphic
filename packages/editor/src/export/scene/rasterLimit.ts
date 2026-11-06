// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The most pixels one bitmap may have: iOS Safari refuses a canvas of more than 2^24 px, and a
 * print page at 300 dpi (A3: ~17.4 Mpx) is over it.
 */
export const MAX_RASTER_PIXELS = 16_777_216;

/**
 * `pixelRatio`, lowered if a box of `width` x `height` page px would be over `MAX_RASTER_PIXELS`
 * at it; the aspect ratio is kept. `reduced` says whether it had to be.
 */
export function fitPixelRatio(
  width: number,
  height: number,
  pixelRatio: number
): { pixelRatio: number; reduced: boolean } {
  // Snapping a box to whole device px and the rasteriser's `ceil` add up to 2 px a side; the margin
  // keeps the result inside.
  const pixels = (Math.ceil(width * pixelRatio) + 2) * (Math.ceil(height * pixelRatio) + 2);
  if (!(pixels > MAX_RASTER_PIXELS) || !(width > 0) || !(height > 0)) {
    return { pixelRatio, reduced: false };
  }
  // `ceil(w*r) + 2` is under `w*r + 3`: solve (w*r + 3) * (h*r + 3) = MAX for r, then take a hair
  // less, so the checked product is guaranteed to be within the limit.
  const a = width * height;
  const b = 3 * (width + height);
  const r = (-b + Math.sqrt(b * b + 4 * a * (MAX_RASTER_PIXELS - 9))) / (2 * a);
  return { pixelRatio: Math.min(pixelRatio, r * 0.9999), reduced: true };
}
