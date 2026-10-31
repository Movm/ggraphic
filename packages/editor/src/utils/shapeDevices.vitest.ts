// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import {
  arrowPoints,
  bubbleExtent,
  ringGeometry,
  tailPoints,
  traceBubble,
  type Tail,
} from './shapeDevices.js';

const NO_CORNERS: [number, number, number, number] = [0, 0, 0, 0];

describe('ringGeometry', () => {
  it('keeps the filled ring of old documents: inner radius 0.3 of the width, full circle', () => {
    expect(ringGeometry(200, undefined, undefined)).toEqual({
      outer: 100,
      inner: 60,
      full: true,
      empty: false,
      start: -Math.PI / 2,
      end: -Math.PI / 2 + Math.PI * 2,
    });
  });

  it('takes the stroke width from ringWidth, measured inwards from the outer radius', () => {
    const ring = ringGeometry(200, 20, undefined);
    expect(ring.outer).toBe(100);
    expect(ring.inner).toBe(80);
  });

  it('clamps ringWidth to the radius', () => {
    expect(ringGeometry(200, 500, undefined).inner).toBe(0);
    expect(ringGeometry(200, -4, undefined).inner).toBe(100);
  });

  it('starts at twelve o clock and runs clockwise for a share of the circle', () => {
    const ring = ringGeometry(200, 20, 0.25);
    expect(ring.full).toBe(false);
    expect(ring.start).toBeCloseTo(-Math.PI / 2);
    expect(ring.end).toBeCloseTo(0); // three o clock
  });

  it('treats an arc of 1 or more as the full ring and 0 or less as nothing', () => {
    expect(ringGeometry(200, 20, 1).full).toBe(true);
    expect(ringGeometry(200, 20, 3).full).toBe(true);
    expect(ringGeometry(200, 20, 0).empty).toBe(true);
    expect(ringGeometry(200, 20, -1).empty).toBe(true);
  });
});

describe('arrowPoints', () => {
  it('is the straight shaft of old documents without a bend', () => {
    expect(arrowPoints(300, undefined)).toEqual({ points: [-150, 0, 150, 0], tension: 0 });
    expect(arrowPoints(300, 0)).toEqual({ points: [-150, 0, 150, 0], tension: 0 });
  });

  it('sags the middle by bend times the length, positive downwards', () => {
    expect(arrowPoints(300, 0.2)).toEqual({ points: [-150, 0, 0, 60, 150, 0], tension: 0.5 });
    expect(arrowPoints(300, -0.1).points[3]).toBe(-30);
  });
});

describe('tailPoints', () => {
  const tail = (over: Partial<Tail> = {}): Tail => ({ side: 'bottom', at: 0.5, size: 40, ...over });

  it('puts the bottom tail below the box, tip straight out from the base centre', () => {
    expect(tailPoints(tail(), 400, 200, NO_CORNERS)).toEqual({
      base1: [220, 200],
      tip: [200, 240],
      base2: [180, 200],
    });
  });

  it('puts the tail on each side, in the clockwise order of the outline', () => {
    expect(tailPoints(tail({ side: 'top' }), 400, 200, NO_CORNERS)).toEqual({
      base1: [180, 0],
      tip: [200, -40],
      base2: [220, 0],
    });
    expect(tailPoints(tail({ side: 'right' }), 400, 200, NO_CORNERS)).toEqual({
      base1: [400, 80],
      tip: [440, 100],
      base2: [400, 120],
    });
    expect(tailPoints(tail({ side: 'left' }), 400, 200, NO_CORNERS)).toEqual({
      base1: [0, 120],
      tip: [-40, 100],
      base2: [0, 80],
    });
  });

  it('measures at from the left (top, bottom) or from the top (left, right)', () => {
    expect(tailPoints(tail({ at: 0.25 }), 400, 200, NO_CORNERS).tip[0]).toBe(100);
    expect(tailPoints(tail({ side: 'left', at: 0.25 }), 400, 200, NO_CORNERS).tip[1]).toBe(50);
  });

  it('keeps the base on the straight part of the edge, clear of the corner arcs', () => {
    const corners: [number, number, number, number] = [30, 30, 30, 30];
    // at 0 would put the base centre on the corner: it moves in to radius + half the base.
    const top = (at: number) => tailPoints(tail({ side: 'top', at }), 400, 200, corners);
    expect(top(0).base1).toEqual([30, 0]);
    expect(top(1).base2).toEqual([370, 0]);
  });

  it('centres a base that does not fit between the corners', () => {
    const corners: [number, number, number, number] = [80, 80, 80, 80];
    expect(tailPoints(tail({ size: 60, at: 0 }), 150, 200, corners).tip[0]).toBe(75);
  });
});

describe('bubbleExtent', () => {
  it('is the box with the tail added on its side', () => {
    expect(bubbleExtent(400, 200, { side: 'bottom', at: 0.5, size: 40 })).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 240,
    });
    expect(bubbleExtent(400, 200, { side: 'top', at: 0.5, size: 40 })).toEqual({
      x: 0,
      y: -40,
      width: 400,
      height: 240,
    });
    expect(bubbleExtent(400, 200, { side: 'left', at: 0.5, size: 40 })).toEqual({
      x: -40,
      y: 0,
      width: 440,
      height: 200,
    });
    expect(bubbleExtent(400, 200, { side: 'right', at: 0.5, size: 40 })).toEqual({
      x: 0,
      y: 0,
      width: 440,
      height: 200,
    });
  });

  it('is the box itself without a tail', () => {
    expect(bubbleExtent(400, 200, null)).toEqual({ x: 0, y: 0, width: 400, height: 200 });
  });
});

describe('traceBubble', () => {
  function record() {
    const ops: string[] = [];
    return {
      ops,
      ctx: {
        moveTo: (x: number, y: number) => ops.push(`M${x},${y}`),
        lineTo: (x: number, y: number) => ops.push(`L${x},${y}`),
        arcTo: (a: number, b: number, c: number, d: number, r: number) =>
          ops.push(`A${a},${b},${c},${d},${r}`),
        closePath: () => ops.push('Z'),
      },
    };
  }

  it('traces the plain rounded rectangle when there is no tail', () => {
    const { ops, ctx } = record();
    traceBubble(ctx, 400, 200, [10, 20, 30, 40], null);
    expect(ops).toEqual([
      'M10,0',
      'A400,0,400,200,20',
      'A400,200,0,200,30',
      'A0,200,0,0,40',
      'A0,0,400,0,10',
      'Z',
    ]);
  });

  it('inserts the tail into its own edge only, between the two corner arcs', () => {
    const { ops, ctx } = record();
    traceBubble(ctx, 400, 200, NO_CORNERS, { side: 'bottom', at: 0.5, size: 40 });
    expect(ops).toEqual([
      'M0,0',
      'A400,0,400,200,0',
      'A400,200,0,200,0',
      'L220,200',
      'L200,240',
      'L180,200',
      'A0,200,0,0,0',
      'A0,0,400,0,0',
      'Z',
    ]);
  });
});
