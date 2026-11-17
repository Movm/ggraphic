// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { cornersOf, hasCorners, traceRoundedRect } from './cornerRadius';

describe('cornersOf', () => {
  it('spreads a number over all four corners and keeps a list in CSS order', () => {
    expect(cornersOf(12, 100, 100)).toEqual([12, 12, 12, 12]);
    expect(cornersOf([40, 0, 0, 8], 100, 100)).toEqual([40, 0, 0, 8]);
  });

  it('is square without a radius', () => {
    expect(cornersOf(undefined, 100, 100)).toEqual([0, 0, 0, 0]);
  });

  it('clamps each corner to half the short side and drops junk', () => {
    expect(cornersOf([80, 10, -3, Number.NaN], 100, 60)).toEqual([30, 10, 0, 0]);
  });
});

describe('hasCorners', () => {
  it('tells a rounded box from a square one', () => {
    expect(hasCorners(undefined)).toBe(false);
    expect(hasCorners(0)).toBe(false);
    expect(hasCorners([0, 0, 0, 0])).toBe(false);
    expect(hasCorners([0, 0, 0, 64])).toBe(true);
    expect(hasCorners(5)).toBe(true);
  });
});

describe('traceRoundedRect', () => {
  const trace = (corners: [number, number, number, number]) => {
    const calls: unknown[][] = [];
    const ctx = {
      moveTo: (...a: number[]) => calls.push(['moveTo', ...a]),
      arcTo: (...a: number[]) => calls.push(['arcTo', ...a]),
      closePath: () => calls.push(['closePath']),
    };
    traceRoundedRect(ctx, 200, 100, corners);
    return calls;
  };

  it('starts after the top-left corner and rounds clockwise', () => {
    expect(trace([10, 20, 30, 40])).toEqual([
      ['moveTo', 10, 0],
      ['arcTo', 200, 0, 200, 100, 20],
      ['arcTo', 200, 100, 0, 100, 30],
      ['arcTo', 0, 100, 0, 0, 40],
      ['arcTo', 0, 0, 200, 0, 10],
      ['closePath'],
    ]);
  });
});
