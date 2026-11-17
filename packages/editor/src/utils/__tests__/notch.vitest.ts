// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { notchPath, notchPx, traceNotch } from '../notch.js';

describe('notchPath', () => {
  it('cuts a square from the top-right corner', () => {
    expect(notchPath(100, 80, 20)).toEqual([0, 0, 80, 0, 80, 20, 100, 20, 100, 80, 0, 80]);
  });

  it('clamps the cut to half the shorter side', () => {
    expect(notchPath(100, 30, 50)).toEqual([0, 0, 85, 0, 85, 15, 100, 15, 100, 30, 0, 30]);
  });

  it('turns the stored share of the canvas width into px', () => {
    expect(notchPx(0.05, 1080)).toBeCloseTo(54);
    expect(notchPx(0.05, undefined)).toBe(0);
  });

  it('traces the same polygon on a context', () => {
    const calls: string[] = [];
    const ctx = {
      beginPath: () => calls.push('begin'),
      moveTo: (x: number, y: number) => calls.push(`M${x},${y}`),
      lineTo: (x: number, y: number) => calls.push(`L${x},${y}`),
      closePath: () => calls.push('close'),
    };
    traceNotch(ctx, 100, 80, 20);
    expect(calls).toEqual([
      'begin',
      'M0,0',
      'L80,0',
      'L80,20',
      'L100,20',
      'L100,80',
      'L0,80',
      'close',
    ]);
  });
});
