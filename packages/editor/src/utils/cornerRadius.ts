// SPDX-License-Identifier: MPL-2.0
import { type Corners, type CornerRadius } from '@ggraphic/core';

export { type Corners, type CornerRadius } from '@ggraphic/core';

/** The four radii of `radius` on a `width` × `height` box, each clamped to half the short side. */
export function cornersOf(
  radius: CornerRadius | undefined,
  width: number,
  height: number
): Corners {
  const limit = Math.min(width, height) / 2;
  const fit = (r: number | undefined) => (typeof r === 'number' && r > 0 ? Math.min(r, limit) : 0);
  return Array.isArray(radius)
    ? [fit(radius[0]), fit(radius[1]), fit(radius[2]), fit(radius[3])]
    : [fit(radius), fit(radius), fit(radius), fit(radius)];
}

/** Whether any corner is rounded. */
export function hasCorners(radius: CornerRadius | undefined): boolean {
  return Array.isArray(radius) ? radius.some((r) => r > 0) : (radius ?? 0) > 0;
}

/** Traces a rounded box from the origin, clockwise from the top-left corner's end. */
export function traceRoundedRect(
  ctx: {
    moveTo(x: number, y: number): void;
    arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
    closePath(): void;
  },
  width: number,
  height: number,
  [tl, tr, br, bl]: Corners
): void {
  ctx.moveTo(tl, 0);
  ctx.arcTo(width, 0, width, height, tr);
  ctx.arcTo(width, height, 0, height, br);
  ctx.arcTo(0, height, 0, 0, bl);
  ctx.arcTo(0, 0, width, 0, tl);
  ctx.closePath();
}

/** Whether two radii describe the same corners (lists compare by value, for memo checks). */
export function sameCorners(a: CornerRadius | undefined, b: CornerRadius | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.every((r, i) => r === b[i]);
  return a === b;
}
