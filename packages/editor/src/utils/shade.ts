// SPDX-License-Identifier: MPL-2.0
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

/** The gradient a shape paints: its shade wins over `fillGradient`; `null` for a flat fill. */
export function shapeGradient(shape: {
  fill: string;
  shade?: ShadeDirection | null;
  fillGradient?: GradientFill | null;
}): GradientFill | null {
  if (shape.shade) return shadeGradient(shape.fill, shape.shade);
  return shape.fillGradient ?? null;
}
