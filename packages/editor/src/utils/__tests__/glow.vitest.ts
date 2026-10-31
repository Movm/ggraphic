// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { shapeGradient } from '../shade.js';

import type { GradientFill } from '../gradientFill.js';

const glow = { type: 'ellipse', fill: '#D4146E', glow: true, width: 400, height: 300 } as const;

describe('glow', () => {
  it('is a radial fade centred in the shape, reaching its edge', () => {
    const g = shapeGradient(glow)!;
    expect(g.type).toBe('radial');
    expect(g.centre).toEqual({ x: 200, y: 150 });
    expect(g.radius).toBe(200);
    expect(g.stops).toEqual([
      { offset: 0, color: 'rgba(212,20,110,1)' },
      { offset: 0.6, color: 'rgba(212,20,110,0.45)' },
      { offset: 1, color: 'rgba(212,20,110,0)' },
    ]);
  });

  it('follows the bound fill: rebinding changes every stop, no literal is kept', () => {
    const a = shapeGradient(glow)!;
    const b = shapeGradient({ ...glow, fill: '#00A0E0' })!;
    expect(b.stops.map((s) => s.color)).toEqual([
      'rgba(0,160,224,1)',
      'rgba(0,160,224,0.45)',
      'rgba(0,160,224,0)',
    ]);
    expect(a.stops.every((s, i) => s.color !== b.stops[i]!.color)).toBe(true);
  });

  it('works on a rect and is ignored by other types', () => {
    expect(shapeGradient({ ...glow, type: 'rect' })?.type).toBe('radial');
    expect(shapeGradient({ ...glow, type: 'star' })).toBeNull();
  });

  it('ranks shade above glow above fillGradient', () => {
    const fillGradient: GradientFill = { type: 'linear', angle: 0, stops: [] };
    expect(shapeGradient({ ...glow, fillGradient })?.type).toBe('radial');
    expect(shapeGradient({ ...glow, fillGradient, shade: 'top' })?.type).toBe('linear');
    expect(shapeGradient({ ...glow, glow: false, fillGradient })).toBe(fillGradient);
  });
});
