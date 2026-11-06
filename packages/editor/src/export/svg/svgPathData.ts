// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The geometry of SVG as scene path commands: path data, the basic shapes, `transform` lists and
 * the bounding box a gradient needs. Pure functions; no DOM.
 */
import { IDENTITY, apply, multiply } from '../scene/matrix.js';
import { arcToBeziers } from '../scene/recordingContext.js';

import type { Matrix, PathCommand } from '../scene/types.js';

type CubicCommand = Extract<PathCommand, { op: 'C' }>;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------------------------
// Numbers

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/** A whitespace/comma separated list of numbers; `null` if anything in it is not a number. */
export function parseNumberList(value: string): number[] | null {
  const items = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const numbers = items.map((item) =>
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(item) ? Number(item) : NaN
  );
  return numbers.every(Number.isFinite) ? numbers : null;
}

// ---------------------------------------------------------------------------------------------
// Arcs

/**
 * An SVG elliptical arc (endpoint parameterisation, SVG 1.1 F.6.5) as cubics. The caller is
 * already at `(x1, y1)`. A zero radius is a line, radii too small for the chord are scaled up.
 */
export function arcCommands(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotationDegrees: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number
): PathCommand[] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ op: 'L', x: x2, y: y2 }];
  const phi = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coefficient = Math.sqrt(Math.max(0, numerator / denominator));
  if (largeArc === sweep) coefficient = -coefficient;
  const cxp = (coefficient * rx * y1p) / ry;
  const cyp = (-coefficient * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const start = Math.atan2(uy, ux);
  let delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const { curves } = arcToBeziers(cx, cy, rx, ry, phi, start, delta);
  // The parameterisation lands a few ulps off the endpoint the data names.
  const last = curves.at(-1);
  if (last) {
    last.x = x2;
    last.y = y2;
  }
  return curves;
}

// ---------------------------------------------------------------------------------------------
// Path data

/**
 * The commands of an SVG `d` attribute. Data after the first error is dropped and what came
 * before it is kept, as the SVG error handling says. Relative commands are made absolute;
 * `H`/`V`/`S`/`T`/`A` become `L`/`C`/`Q`/`C`.
 */
export function parsePathData(data: string): PathCommand[] {
  const out: PathCommand[] = [];
  let i = 0;
  const separators = () => {
    while (i < data.length && /[\s,]/.test(data[i]!)) i++;
  };
  const number = (): number | null => {
    separators();
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(data);
    if (!match) return null;
    i = NUMBER.lastIndex;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  };
  const flag = (): boolean | null => {
    separators();
    const c = data[i];
    if (c !== '0' && c !== '1') return null;
    i++;
    return c === '1';
  };
  const numbers = (count: number): number[] | null => {
    const values: number[] = [];
    for (let n = 0; n < count; n++) {
      const v = number();
      if (v === null) return null;
      values.push(v);
    }
    return values;
  };

  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // The reflected control point of the previous curve, for S and T.
  let control: { kind: 'c' | 'q'; x: number; y: number } | null = null;
  let command = '';
  let closed = false;

  const moveIfClosed = () => {
    if (closed) out.push({ op: 'M', x, y });
    closed = false;
  };

  for (;;) {
    separators();
    if (i >= data.length) break;
    if (/[A-Za-z]/.test(data[i]!)) command = data[i++]!;
    else if (command === '' || command === 'Z' || command === 'z') break;
    const lower = command.toLowerCase();
    if (out.length === 0 && lower !== 'm') break;
    const relative = command !== command.toUpperCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    let next: { kind: 'c' | 'q'; x: number; y: number } | null = null;

    if (lower === 'z') {
      if (out.length > 0 && !closed) out.push({ op: 'Z' });
      x = startX;
      y = startY;
      closed = true;
    } else if (lower === 'm') {
      const v = numbers(2);
      if (!v) break;
      x = v[0]! + ox;
      y = v[1]! + oy;
      startX = x;
      startY = y;
      closed = false;
      out.push({ op: 'M', x, y });
      // Further pairs after a moveto are linetos.
      command = relative ? 'l' : 'L';
    } else if (lower === 'l') {
      const v = numbers(2);
      if (!v) break;
      moveIfClosed();
      x = v[0]! + ox;
      y = v[1]! + oy;
      out.push({ op: 'L', x, y });
    } else if (lower === 'h') {
      const v = numbers(1);
      if (!v) break;
      moveIfClosed();
      x = v[0]! + ox;
      out.push({ op: 'L', x, y });
    } else if (lower === 'v') {
      const v = numbers(1);
      if (!v) break;
      moveIfClosed();
      y = v[0]! + oy;
      out.push({ op: 'L', x, y });
    } else if (lower === 'c' || lower === 's') {
      const v = numbers(lower === 'c' ? 6 : 4);
      if (!v) break;
      moveIfClosed();
      let x1 = x;
      let y1 = y;
      if (lower === 'c') {
        x1 = v[0]! + ox;
        y1 = v[1]! + oy;
        v.splice(0, 2);
      } else if (control?.kind === 'c') {
        x1 = 2 * x - control.x;
        y1 = 2 * y - control.y;
      }
      const [cx2, cy2, ex, ey] = [v[0]! + ox, v[1]! + oy, v[2]! + ox, v[3]! + oy];
      out.push({ op: 'C', x1, y1, x2: cx2, y2: cy2, x: ex, y: ey });
      next = { kind: 'c', x: cx2, y: cy2 };
      x = ex;
      y = ey;
    } else if (lower === 'q' || lower === 't') {
      const v = numbers(lower === 'q' ? 4 : 2);
      if (!v) break;
      moveIfClosed();
      let x1 = x;
      let y1 = y;
      if (lower === 'q') {
        x1 = v[0]! + ox;
        y1 = v[1]! + oy;
        v.splice(0, 2);
      } else if (control?.kind === 'q') {
        x1 = 2 * x - control.x;
        y1 = 2 * y - control.y;
      }
      const [ex, ey] = [v[0]! + ox, v[1]! + oy];
      out.push({ op: 'Q', x1, y1, x: ex, y: ey });
      next = { kind: 'q', x: x1, y: y1 };
      x = ex;
      y = ey;
    } else if (lower === 'a') {
      const rx = number();
      const ry = number();
      const rotation = number();
      const large = flag();
      const sweep = flag();
      const ex = number();
      const ey = number();
      if (
        rx === null ||
        ry === null ||
        rotation === null ||
        large === null ||
        sweep === null ||
        ex === null ||
        ey === null
      ) {
        break;
      }
      moveIfClosed();
      out.push(...arcCommands(x, y, rx, ry, rotation, large, sweep, ex + ox, ey + oy));
      x = ex + ox;
      y = ey + oy;
    } else {
      break;
    }
    control = next;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shapes

/** A rectangle, with corner radii when `rx`/`ry` are positive (already clamped by the caller). */
export function rectCommands(
  x: number,
  y: number,
  width: number,
  height: number,
  rx = 0,
  ry = 0
): PathCommand[] {
  if (!(rx > 0 && ry > 0)) {
    return [
      { op: 'M', x, y },
      { op: 'L', x: x + width, y },
      { op: 'L', x: x + width, y: y + height },
      { op: 'L', x, y: y + height },
      { op: 'Z' },
    ];
  }
  const right = x + width;
  const bottom = y + height;
  return [
    { op: 'M', x: x + rx, y },
    { op: 'L', x: right - rx, y },
    ...arcCommands(right - rx, y, rx, ry, 0, false, true, right, y + ry),
    { op: 'L', x: right, y: bottom - ry },
    ...arcCommands(right, bottom - ry, rx, ry, 0, false, true, right - rx, bottom),
    { op: 'L', x: x + rx, y: bottom },
    ...arcCommands(x + rx, bottom, rx, ry, 0, false, true, x, bottom - ry),
    { op: 'L', x, y: y + ry },
    ...arcCommands(x, y + ry, rx, ry, 0, false, true, x + rx, y),
    { op: 'Z' },
  ];
}

/** A full ellipse, starting at its right-most point and running clockwise on screen. */
export function ellipseCommands(cx: number, cy: number, rx: number, ry: number): PathCommand[] {
  const { start, curves } = arcToBeziers(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
  const last: CubicCommand | undefined = curves.at(-1);
  if (last) {
    last.x = start.x;
    last.y = start.y;
  }
  return [{ op: 'M', x: start.x, y: start.y }, ...curves, { op: 'Z' }];
}

/** `points` of a polyline/polygon; an odd trailing number is dropped. */
export function pointsCommands(points: string, close: boolean): PathCommand[] {
  const numbers: number[] = [];
  const re = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
  for (const match of points.matchAll(re)) numbers.push(Number(match[0]));
  const out: PathCommand[] = [];
  for (let n = 0; n + 1 < numbers.length; n += 2) {
    out.push({ op: n === 0 ? 'M' : 'L', x: numbers[n]!, y: numbers[n + 1]! });
  }
  if (close && out.length > 0) out.push({ op: 'Z' });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Transforms of paths

export function transformCommands(commands: readonly PathCommand[], m: Matrix): PathCommand[] {
  return commands.map((c): PathCommand => {
    switch (c.op) {
      case 'Z':
        return c;
      case 'M':
      case 'L':
        return { op: c.op, ...apply(m, c.x, c.y) };
      case 'Q': {
        const p1 = apply(m, c.x1, c.y1);
        const p = apply(m, c.x, c.y);
        return { op: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y };
      }
      case 'C': {
        const p1 = apply(m, c.x1, c.y1);
        const p2 = apply(m, c.x2, c.y2);
        const p = apply(m, c.x, c.y);
        return { op: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
      }
    }
  });
}

/** The interior roots in (0, 1) of the derivative of one coordinate of a bezier. */
function extrema(p0: number, p1: number, p2: number, p3: number | null): number[] {
  if (p3 === null) {
    const denominator = p0 - 2 * p1 + p2;
    const t = denominator === 0 ? NaN : (p0 - p1) / denominator;
    return t > 0 && t < 1 ? [t] : [];
  }
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (b !== 0) roots.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      roots.push((-b + root) / (2 * a), (-b - root) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

/** The exact bounding box of the geometry (curve extrema included), or `null` for no points. */
export function commandBounds(commands: readonly PathCommand[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (px: number, py: number) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  };
  let cx = 0;
  let cy = 0;
  for (const c of commands) {
    switch (c.op) {
      case 'M':
      case 'L':
        add(c.x, c.y);
        cx = c.x;
        cy = c.y;
        break;
      case 'Q': {
        add(c.x, c.y);
        const at = (t: number, a: number, b: number, e: number) =>
          (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * e;
        for (const t of extrema(cx, c.x1, c.x, null))
          add(at(t, cx, c.x1, c.x), at(t, cy, c.y1, c.y));
        for (const t of extrema(cy, c.y1, c.y, null))
          add(at(t, cx, c.x1, c.x), at(t, cy, c.y1, c.y));
        cx = c.x;
        cy = c.y;
        break;
      }
      case 'C': {
        add(c.x, c.y);
        const at = (t: number, a: number, b: number, e: number, f: number) =>
          (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * e + t ** 3 * f;
        const ts = [...extrema(cx, c.x1, c.x2, c.x), ...extrema(cy, c.y1, c.y2, c.y)];
        for (const t of ts) add(at(t, cx, c.x1, c.x2, c.x), at(t, cy, c.y1, c.y2, c.y));
        cx = c.x;
        cy = c.y;
        break;
      }
      case 'Z':
        break;
    }
  }
  return minX <= maxX ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}

// ---------------------------------------------------------------------------------------------
// Transform lists

const TRANSFORM = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?/y;

/** The matrix of an SVG `transform` list; `null` when it does not parse. */
export function parseTransform(value: string): Matrix | null {
  const text = value.trim();
  let m: Matrix = IDENTITY;
  let i = 0;
  while (i < text.length) {
    TRANSFORM.lastIndex = i;
    const match = TRANSFORM.exec(text);
    if (!match) return null;
    i = TRANSFORM.lastIndex;
    const args = parseNumberList(match[2]!);
    if (!args) return null;
    const step = transformStep(match[1]!, args);
    if (!step) return null;
    m = multiply(m, step);
  }
  return m;
}

function transformStep(name: string, a: number[]): Matrix | null {
  switch (name) {
    case 'matrix':
      return a.length === 6 ? [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!] : null;
    case 'translate':
      return a.length === 1 || a.length === 2 ? [1, 0, 0, 1, a[0]!, a[1] ?? 0] : null;
    case 'scale':
      return a.length === 1 || a.length === 2 ? [a[0]!, 0, 0, a[1] ?? a[0]!, 0, 0] : null;
    case 'rotate': {
      if (a.length !== 1 && a.length !== 3) return null;
      const angle = (a[0]! * Math.PI) / 180;
      const rotation: Matrix = [
        Math.cos(angle),
        Math.sin(angle),
        -Math.sin(angle),
        Math.cos(angle),
        0,
        0,
      ];
      if (a.length === 1) return rotation;
      return multiply(multiply([1, 0, 0, 1, a[1]!, a[2]!], rotation), [1, 0, 0, 1, -a[1]!, -a[2]!]);
    }
    case 'skewX':
      return a.length === 1 ? [1, 0, Math.tan((a[0]! * Math.PI) / 180), 1, 0, 0] : null;
    case 'skewY':
      return a.length === 1 ? [1, Math.tan((a[0]! * Math.PI) / 180), 0, 1, 0, 0] : null;
    default:
      return null;
  }
}
