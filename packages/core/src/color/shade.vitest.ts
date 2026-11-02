// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { SHADE_STOPS, shadeAlphaAt } from './shade.js';

describe('shadeAlphaAt', () => {
  it('matches the stops at 0, every stop offset and 1, and interpolates linearly between', () => {
    for (const direction of ['bottom', 'top'] as const) {
      for (const [offset, alpha] of SHADE_STOPS[direction]) {
        expect(shadeAlphaAt(direction, offset)).toBeCloseTo(alpha, 10);
      }
      expect(shadeAlphaAt(direction, 0)).toBe(SHADE_STOPS[direction][0]?.[1]);
      expect(shadeAlphaAt(direction, 1)).toBe(SHADE_STOPS[direction].at(-1)?.[1]);
    }
    expect(shadeAlphaAt('bottom', 0.31)).toBeCloseTo(0.41, 10);
    expect(shadeAlphaAt('bottom', 0.81)).toBeCloseTo(0.82 + (0.12 * 0.19) / 0.38, 10);
    expect(shadeAlphaAt('top', 0.275)).toBeCloseTo(0.74, 10);
  });

  it('clamps outside 0..1', () => {
    expect(shadeAlphaAt('bottom', -3)).toBe(0);
    expect(shadeAlphaAt('top', 7)).toBe(0);
  });

  it('keeps the prototype values', () => {
    expect(SHADE_STOPS).toEqual({
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
    });
  });
});
