// SPDX-License-Identifier: AGPL-3.0-only
import { SHADE_STOPS, type ShadeDirection } from '@ggraphic/core';
import Konva from 'konva';

import type { GradientFill } from './gradientFill.js';

export type { ShadeDirection };

/**
 * The gradient a shade shape paints: `color` fading in from one edge of a photo,
 * for legible text on top. Only the rgb of `color` counts, every stop sets its own alpha.
 */
export function shadeGradient(color: string, direction: ShadeDirection): GradientFill {
  const rgba = Konva.Util.colorToRGBA(color);
  const [r, g, b] = rgba ? [rgba.r, rgba.g, rgba.b] : [0, 0, 0];
  return {
    type: 'linear',
    angle: 90,
    stops: SHADE_STOPS[direction].map(([offset, alpha]) => ({
      offset,
      color: `rgba(${r}, ${g}, ${b}, ${alpha})`,
    })),
  };
}

/** Where the glow is full, half faded and gone (the prototypes' `transparent 70%` profile). */
const GLOW_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.6, 0.45],
  [1, 0],
];

/** Shapes that can glow. */
const GLOW_TYPES: ReadonlySet<string> = new Set(['ellipse', 'rect']);

/**
 * A soft colour field: `color` at full strength in the middle, fading to nothing at the edge.
 * The stops are derived from `color`, so rebinding the fill recolours the whole glow.
 * Radius is the half width; the painter squeezes it to the shape's height.
 */
export function glowGradient(color: string, width: number, height: number): GradientFill {
  const rgba = Konva.Util.colorToRGBA(color);
  const [r, g, b] = rgba ? [rgba.r, rgba.g, rgba.b] : [0, 0, 0];
  return {
    type: 'radial',
    angle: 0,
    stops: GLOW_STOPS.map(([offset, alpha]) => ({
      offset,
      color: `rgba(${r},${g},${b},${alpha})`,
    })),
    centre: { x: width / 2, y: height / 2 },
    radius: width / 2,
  };
}

/** The gradient a shape paints: shade, then glow, then `fillGradient`; `null` for a flat fill. */
export function shapeGradient(shape: {
  type?: string;
  fill: string;
  shade?: ShadeDirection | null;
  glow?: boolean;
  width?: number;
  height?: number;
  fillGradient?: GradientFill | null;
}): GradientFill | null {
  if (shape.shade) return shadeGradient(shape.fill, shape.shade);
  if (shape.glow && shape.type && GLOW_TYPES.has(shape.type)) {
    return glowGradient(shape.fill, shape.width ?? 0, shape.height ?? 0);
  }
  return shape.fillGradient ?? null;
}
