// SPDX-License-Identifier: AGPL-3.0-only
import type { Matrix } from './types.js';

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/**
 * `a · b`: the matrix that applies `b` first, then `a`. With `a` the current transform,
 * `multiply(a, b)` is what the canvas `transform(...b)` call leaves behind.
 */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** Throws a `RangeError` for a singular matrix; there is no sensible inverse to hand back. */
export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || det === 0) throw new RangeError('cannot invert a singular matrix');
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
