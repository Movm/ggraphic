// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { IDENTITY, apply, invert, multiply } from './matrix.js';

import type { Matrix } from './types.js';

describe('scene matrix helpers', () => {
  it('multiply(a, b) applies b first, then a (canvas transform() order)', () => {
    const translate: Matrix = [1, 0, 0, 1, 10, 0];
    const scale: Matrix = [2, 0, 0, 2, 0, 0];
    const m = multiply(translate, scale);
    expect(m).toEqual([2, 0, 0, 2, 10, 0]);
    expect(apply(m, 1, 1)).toEqual({ x: 12, y: 2 });
  });

  it('the identity is neutral on both sides', () => {
    const m: Matrix = [0, 1, -1, 0, 5, 6];
    expect(multiply(IDENTITY, m)).toEqual(m);
    expect(multiply(m, IDENTITY)).toEqual(m);
  });

  it('invert undoes a transform', () => {
    const m: Matrix = [2, 1, -1, 3, 7, -4];
    const round = multiply(m, invert(m));
    round.forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i]!, 12));
    const p = apply(invert(m), apply(m, 3, 5).x, apply(m, 3, 5).y);
    expect(p.x).toBeCloseTo(3, 12);
    expect(p.y).toBeCloseTo(5, 12);
  });

  it('invert refuses a singular matrix', () => {
    expect(() => invert([0, 0, 0, 0, 1, 1])).toThrow(RangeError);
  });
});
