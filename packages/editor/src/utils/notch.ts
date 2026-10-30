// SPDX-License-Identifier: MPL-2.0
/**
 * The notch: a square cut from the top-right corner of a rect or a photo. One outline
 * serves the fill, the photo clip and the texture clip, so they cannot drift apart.
 */

/** The polygon `[x0,y0, x1,y1, …]` of a `w` × `h` box without its top-right `n` × `n` corner. */
export function notchPath(w: number, h: number, n: number): number[] {
  const cut = Math.max(0, Math.min(n, Math.min(w, h) / 2));
  return [0, 0, w - cut, 0, w - cut, cut, w, cut, w, h, 0, h];
}

/** The stored notch (a share of the canvas width) in px; without a canvas width, no notch. */
export function notchPx(notch: number | undefined, canvasWidth: number | undefined): number {
  return notch && canvasWidth ? notch * canvasWidth : 0;
}

interface PathContext {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/** Traces the notched outline on a canvas or Konva context. */
export function traceNotch(ctx: PathContext, w: number, h: number, n: number): void {
  const p = notchPath(w, h, n);
  ctx.beginPath();
  ctx.moveTo(p[0]!, p[1]!);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
  ctx.closePath();
}
