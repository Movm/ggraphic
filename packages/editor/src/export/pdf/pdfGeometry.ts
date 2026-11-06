// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The arithmetic of the PDF writer: number formatting, path operators, and bounding boxes of ops
 * (for raster islands and soft masks). No pdf-lib here; the output is text a content stream holds.
 */
import { apply } from '../scene/matrix.js';
import { formatNumber } from '../svg/xml.js';

import type { Matrix, PathCommand, SceneOp } from '../scene/types.js';

/** Min and max corners. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const num = (value: number): string => formatNumber(value, 3);

/** Colour components and the like: 4 decimals round-trip an 8 bit channel. */
export const unit = (value: number): string => formatNumber(value, 4);

/** The linear part has six decimals (a rotation 1000 px from the origin), the move three. */
export function matrixOperands(m: Matrix): string {
  const [a, b, c, d] = [m[0], m[1], m[2], m[3]].map((v) => formatNumber(v, 6));
  return `${a} ${b} ${c} ${d} ${num(m[4])} ${num(m[5])}`;
}

export const isIdentity = (m: Matrix): boolean =>
  m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

/** A matrix that squeezes the plane to a line or a point (or is not a number) draws nothing. */
export function isDegenerate(m: Matrix): boolean {
  const det = m[0] * m[3] - m[1] * m[2];
  return !m.every(Number.isFinite) || det === 0;
}

// ---------------------------------------------------------------------------------------------
// Paths

/**
 * The path as PDF operators, every point mapped by `m` when given. PDF has no quadratic curve:
 * `Q` becomes the cubic with the same shape. A segment that starts a path without a `M` starts
 * one at its first point, as the canvas does.
 */
export function pathOperators(commands: readonly PathCommand[], m?: Matrix): string {
  const out: string[] = [];
  const point = (x: number, y: number) => {
    const p = m ? apply(m, x, y) : { x, y };
    return `${num(p.x)} ${num(p.y)}`;
  };
  let open = false;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const c of commands) {
    switch (c.op) {
      case 'M':
        out.push(`${point(c.x, c.y)} m`);
        [cx, cy, sx, sy, open] = [c.x, c.y, c.x, c.y, true];
        break;
      case 'L':
        out.push(`${point(c.x, c.y)} ${open ? 'l' : 'm'}`);
        if (!open) [sx, sy, open] = [c.x, c.y, true];
        [cx, cy] = [c.x, c.y];
        break;
      case 'C':
        if (!open) {
          out.push(`${point(c.x1, c.y1)} m`);
          [cx, cy, sx, sy, open] = [c.x1, c.y1, c.x1, c.y1, true];
        }
        out.push(`${point(c.x1, c.y1)} ${point(c.x2, c.y2)} ${point(c.x, c.y)} c`);
        [cx, cy] = [c.x, c.y];
        break;
      case 'Q':
        if (!open) {
          out.push(`${point(c.x1, c.y1)} m`);
          [cx, cy, sx, sy, open] = [c.x1, c.y1, c.x1, c.y1, true];
        }
        out.push(
          `${point(cx + (2 / 3) * (c.x1 - cx), cy + (2 / 3) * (c.y1 - cy))} ` +
            `${point(c.x + (2 / 3) * (c.x1 - c.x), c.y + (2 / 3) * (c.y1 - c.y))} ` +
            `${point(c.x, c.y)} c`
        );
        [cx, cy] = [c.x, c.y];
        break;
      case 'Z':
        out.push('h');
        [cx, cy] = [sx, sy];
        break;
    }
  }
  return out.join(' ');
}

// ---------------------------------------------------------------------------------------------
// Bounds

export function commandsBounds(commands: readonly PathCommand[]): Rect | null {
  let bounds: Rect | null = null;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    bounds = bounds
      ? {
          x0: Math.min(bounds.x0, x),
          y0: Math.min(bounds.y0, y),
          x1: Math.max(bounds.x1, x),
          y1: Math.max(bounds.y1, y),
        }
      : { x0: x, y0: y, x1: x, y1: y };
  };
  for (const c of commands) {
    if (c.op === 'Z') continue;
    add(c.x, c.y);
    if (c.op === 'C') {
      add(c.x1, c.y1);
      add(c.x2, c.y2);
    } else if (c.op === 'Q') add(c.x1, c.y1);
  }
  return bounds;
}

export function transformRect(rect: Rect, m: Matrix): Rect {
  const corners = [
    apply(m, rect.x0, rect.y0),
    apply(m, rect.x1, rect.y0),
    apply(m, rect.x1, rect.y1),
    apply(m, rect.x0, rect.y1),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export const unionRect = (a: Rect | null, b: Rect | null): Rect | null =>
  !a || !b
    ? (a ?? b)
    : {
        x0: Math.min(a.x0, b.x0),
        y0: Math.min(a.y0, b.y0),
        x1: Math.max(a.x1, b.x1),
        y1: Math.max(a.y1, b.y1),
      };

/** The overlap, or null when the rects do not share any area. */
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const r = {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
  return r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
}

export const growRect = (r: Rect, by: number): Rect => ({
  x0: r.x0 - by,
  y0: r.y0 - by,
  x1: r.x1 + by,
  y1: r.y1 + by,
});

/** How much a matrix can stretch a length. */
export const maxScale = (m: Matrix): number =>
  Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));

type TextOp = Extract<SceneOp, { kind: 'text' }>;
type StrokeOf = Extract<SceneOp, { kind: 'path' }>['stroke'];

/** Half the stroke width, plus what a miter can add, in the op's user space. */
export function strokePad(stroke: StrokeOf): number {
  if (!stroke) return 0.5;
  return (stroke.width / 2) * (stroke.join === 'miter' ? Math.max(1, stroke.miterLimit) : 1);
}

/**
 * Where a text op can put ink, in its user space. Without glyph metrics this is generous: from
 * the first x to the last x plus two em, and the line from above the capitals to below the
 * descenders. A raster island made from it can be larger than the text, never smaller.
 */
export function textBounds(op: Pick<TextOp, 'xs' | 'y' | 'font' | 'mode' | 'stroke'>): Rect | null {
  const xs = op.xs.filter(Number.isFinite);
  if (xs.length === 0 || !Number.isFinite(op.y)) return null;
  const size = op.font.size;
  const pad = op.mode === 'stroke' ? strokePad(op.stroke) : 0;
  return {
    x0: Math.min(...xs) - 0.3 * size - pad,
    y0: op.y - 1.3 * size - pad,
    x1: Math.max(...xs) + 2 * size + pad,
    y1: op.y + 0.5 * size + pad,
  };
}

/** The ink of an op in page px, clipped by its clips. Null: nothing, or nothing that can be known. */
export function opBounds(op: SceneOp): Rect | null {
  let user: Rect | null = null;
  switch (op.kind) {
    case 'path': {
      const bounds = commandsBounds(op.commands);
      user = bounds && (op.mode === 'stroke' ? growRect(bounds, strokePad(op.stroke)) : bounds);
      break;
    }
    case 'text':
      user = textBounds(op);
      break;
    case 'image':
      user = {
        x0: Math.min(op.dx, op.dx + op.dw),
        y0: Math.min(op.dy, op.dy + op.dh),
        x1: Math.max(op.dx, op.dx + op.dw),
        y1: Math.max(op.dy, op.dy + op.dh),
      };
      break;
    case 'raster':
      user = { x0: op.x, y0: op.y, x1: op.x + op.width, y1: op.y + op.height };
      break;
    case 'group': {
      // The children are in page px already; the group's own matrix then moves the buffer.
      let union: Rect | null = null;
      for (const child of op.ops) union = unionRect(union, opBounds(child));
      user = union;
      break;
    }
  }
  return clipped(user && transformRect(user, op.matrix), op);
}

function clipped(bounds: Rect | null, op: SceneOp): Rect | null {
  let result = bounds;
  for (const clip of op.clips) {
    if (!result) return null;
    const box = commandsBounds(clip.commands);
    if (!box) return null;
    result = intersectRect(result, transformRect(box, clip.matrix));
  }
  return result;
}
