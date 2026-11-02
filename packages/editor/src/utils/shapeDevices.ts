// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Three shape devices, as pure geometry so the renderer, the gate adapter and the pptx export
 * share one outline: a ring that can show a share (`arc`), a stroked arrow that can bend
 * (`bend`), and a speech-bubble tail on a rounded rect (`tailSide`, `tailAt`, `tailSize`).
 * Every input is optional; without them each function returns what the shape drew before.
 */
import { type TailSide } from '@ggraphic/core';

import { type Corners } from './cornerRadius.js';

export { type TailSide } from '@ggraphic/core';

export interface Tail {
  side: TailSide;
  /** Where the tail's base is centred along its edge, 0..1 from the left (top, bottom) or the top (left, right). */
  at: number;
  /** Px the tail reaches out of the box; its base is as wide as it is long. */
  size: number;
}

export interface RingGeometry {
  outer: number;
  inner: number;
  /** Angles in radians; 12 o'clock is -π/2, the arc runs clockwise. */
  start: number;
  end: number;
  /** The whole circle: `arc` unset or at least 1. */
  full: boolean;
  /** Nothing to draw: `arc` of 0 or less. */
  empty: boolean;
}

/** The annulus of a `ring` `width` px across. Without `ringWidth` and `arc`: the filled ring of old documents (inner radius 0.3 of the width). */
export function ringGeometry(
  width: number,
  ringWidth: number | undefined,
  arc: number | undefined
): RingGeometry {
  const outer = width / 2;
  const thickness = Math.min(outer, Math.max(0, ringWidth ?? width * 0.2));
  const start = -Math.PI / 2;
  const share = arc === undefined ? 1 : arc;
  return {
    outer,
    inner: outer - thickness,
    start,
    end: start + Math.PI * 2 * Math.min(1, Math.max(0, share)),
    full: share >= 1,
    empty: share <= 0,
  };
}

/** The shaft of a `line-arrow` of `width` px: straight, or through a middle point sagging `bend` × width (positive: down). */
export function arrowPoints(
  width: number,
  bend: number | undefined
): { points: number[]; tension: number } {
  const half = width / 2;
  if (!bend) return { points: [-half, 0, half, 0], tension: 0 };
  return { points: [-half, 0, 0, bend * width, half, 0], tension: 0.5 };
}

type Point = [number, number];

/**
 * The three points of the tail triangle in the clockwise order of the outline (top edge left to
 * right, right edge down, bottom edge right to left, left edge up), in box coordinates with the
 * origin at the top-left. The base stays on the straight part of the edge, clear of the corner arcs.
 */
export function tailPoints(
  tail: Tail,
  width: number,
  height: number,
  [tl, tr, br, bl]: Corners
): { base1: Point; tip: Point; base2: Point } {
  const { side, size } = tail;
  const horizontal = side === 'top' || side === 'bottom';
  const length = horizontal ? width : height;
  const [before, after] =
    side === 'top'
      ? [tl, tr]
      : side === 'bottom'
        ? [bl, br]
        : side === 'left'
          ? [tl, bl]
          : [tr, br];
  const half = size / 2;
  const low = before + half;
  const high = length - after - half;
  const centre = low > high ? length / 2 : Math.min(high, Math.max(low, tail.at * length));
  const a1 = centre - half;
  const a2 = centre + half;
  switch (side) {
    case 'top':
      return { base1: [a1, 0], tip: [centre, -size], base2: [a2, 0] };
    case 'right':
      return { base1: [width, a1], tip: [width + size, centre], base2: [width, a2] };
    case 'bottom':
      return { base1: [a2, height], tip: [centre, height + size], base2: [a1, height] };
    case 'left':
      return { base1: [0, a2], tip: [-size, centre], base2: [0, a1] };
  }
}

/** The box with its tail added, origin at the box's top-left (`x`/`y` go negative for a top or left tail). */
export function bubbleExtent(
  width: number,
  height: number,
  tail: (Pick<Tail, 'side' | 'size'> & { at?: number }) | null
): { x: number; y: number; width: number; height: number } {
  const size = tail ? Math.max(0, tail.size) : 0;
  const side = tail?.side;
  return {
    x: side === 'left' ? -size : 0,
    y: side === 'top' ? -size : 0,
    width: width + (side === 'left' || side === 'right' ? size : 0),
    height: height + (side === 'top' || side === 'bottom' ? size : 0),
  };
}

interface BubbleContext {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  closePath(): void;
}

/**
 * Traces a rounded box with `tail` drawn into the same outline, so fill and stroke see one
 * shape. Same route as `traceRoundedRect`; the tail goes in before the arc that leaves its edge.
 */
export function traceBubble(
  ctx: BubbleContext,
  width: number,
  height: number,
  corners: Corners,
  tail: Tail | null
): void {
  const [tl, tr, br, bl] = corners;
  const tailOn = (side: TailSide) => {
    if (!tail || tail.side !== side) return;
    const { base1, tip, base2 } = tailPoints(tail, width, height, corners);
    ctx.lineTo(base1[0], base1[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(base2[0], base2[1]);
  };
  ctx.moveTo(tl, 0);
  tailOn('top');
  ctx.arcTo(width, 0, width, height, tr);
  tailOn('right');
  ctx.arcTo(width, height, 0, height, br);
  tailOn('bottom');
  ctx.arcTo(0, height, 0, 0, bl);
  tailOn('left');
  ctx.arcTo(0, 0, width, 0, tl);
  ctx.closePath();
}

/** The tail a shape asks for, with defaults; null for anything but a `rounded-rect` with `tailSide`. */
export function tailOf(shape: {
  type: string;
  tailSide?: TailSide;
  tailAt?: number;
  tailSize?: number;
}): Tail | null {
  if (shape.type !== 'rounded-rect' || !shape.tailSide) return null;
  const size = shape.tailSize ?? 40;
  if (!(size > 0)) return null;
  return { side: shape.tailSide, at: Math.min(1, Math.max(0, shape.tailAt ?? 0.5)), size };
}
