// SPDX-License-Identifier: MPL-2.0

export type ShadeDirection = 'bottom' | 'top';

/**
 * [offset, alpha] from the top edge of a shade shape to its bottom edge: the prototype photo
 * gradients (`.shade-b`, `.shade-t`) converted. The editor paints them, the render gate
 * judges text against them, so both read this one table.
 */
export const SHADE_STOPS: Record<ShadeDirection, readonly (readonly [number, number])[]> = {
  bottom: [
    [0, 0],
    [0.62, 0.82],
    [1, 0.94],
  ],
  top: [
    [0, 0.88],
    [0.55, 0.6],
    [1, 0],
  ],
};

/** The alpha of a shade at `t` (0 = top edge of the shape, 1 = bottom edge), piecewise linear, clamped. */
export function shadeAlphaAt(direction: ShadeDirection, t: number): number {
  const stops = SHADE_STOPS[direction];
  const at = Math.min(Math.max(t, 0), 1);
  for (let i = 1; i < stops.length; i++) {
    const [o0, a0] = stops[i - 1] as readonly [number, number];
    const [o1, a1] = stops[i] as readonly [number, number];
    if (at <= o1) return o1 === o0 ? a1 : a0 + ((a1 - a0) * (at - o0)) / (o1 - o0);
  }
  return (stops[stops.length - 1] as readonly [number, number])[1];
}
