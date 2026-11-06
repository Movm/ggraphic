// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A Canvas 2D look-alike that records what Konva draws into scene ops (`types.ts`) instead of
 * painting. It implements the members Konva 10.9 calls on `Context._context`, not the whole
 * interface; callers cast it at that one boundary.
 *
 * How it models the canvas:
 * - **Paths** are kept as the raw commands plus the matrix that was current when each command was
 *   added (canvas semantics: a path point is transformed when it is added, not when it is
 *   painted). `fill`, `stroke` and `clip` emit the path in the user space of the CTM of THAT
 *   call, and the op's `matrix` is that CTM. Gradients, pattern matrices and the stroke width are
 *   also interpreted in the space of the call, so this keeps them exact. When every command was
 *   added under the same matrix as the call (the usual case) the commands are emitted untouched;
 *   when not (Konva's Ellipse scales for the arc, restores, then strokes) each command is mapped
 *   through `inverse(CTM at call) · matrix at add`.
 * - **Unknown calls.** Anything the IR cannot express (other composite operations, filters,
 *   pixel access, Path2D arguments, patterns that do not repeat, paint objects not made here,
 *   letter spacing on the context, right-to-left text, ...) is passed to `onUnknown` with a call
 *   name; the caller turns the element into a raster island. Where the draw can still be recorded
 *   it is, best effort; the caller discards it.
 * - **Text** is recorded at the alphabetic baseline with one x per code point: the x of glyph i is
 *   `width(text[0..i]) - width(text[i])`, measured on the real context so kerning is kept.
 *   Konva's per-glyph letter-spacing calls merge into one op while everything else matches.
 *   Interleaved fill/stroke glyph calls are not merged: each glyph stays its own op.
 * - **Shadow** values are device px, as on a canvas: the CTM does not scale them.
 */
import { IDENTITY, apply, invert, multiply } from './matrix.js';

import type {
  ClipPath,
  ColorStop,
  FontSpec,
  Matrix,
  Paint,
  PathCommand,
  SceneImageRef,
  SceneOp,
  Shadow,
  StrokeStyle,
} from './types.js';

export interface RecordingContextOptions {
  /** Real 2D context used only for measureText (same fonts as the canvas). */
  measure: CanvasRenderingContext2D;
  page: number;
  /** Size of the canvas this context stands for; returned by the `canvas` getter. */
  width: number;
  height: number;
  /** Called for a context call the recorder does not model; the caller turns the element into a raster island. */
  onUnknown: (call: string) => void;
}

// ---------------------------------------------------------------------------------------------
// Arcs

type CubicCommand = Extract<PathCommand, { op: 'C' }>;

/** Longest arc one cubic covers. The radial error is about 4e-6 · r at this angle (2.7e-4 · r at a quarter turn). */
const MAX_SEGMENT = Math.PI / 4;

/**
 * Approximates an elliptical arc by cubic beziers.
 *
 * The ellipse is centred on `(cx, cy)` with radii `rx`, `ry`, rotated by `rotation` (radians).
 * `startAngle` is the parametric angle of the start and `sweep` the signed angle to travel, in
 * the canvas convention: y points down, so a positive sweep runs clockwise on screen.
 *
 * Returns the start point and the cubics from it. The caller emits the `M`/`L` to `start`
 * first, because whether it is a move or a line depends on the path it extends.
 */
export function arcToBeziers(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation: number,
  startAngle: number,
  sweep: number
): { start: { x: number; y: number }; curves: CubicCommand[] } {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const point = (t: number) => {
    const px = rx * Math.cos(t);
    const py = ry * Math.sin(t);
    return { x: cx + px * cos - py * sin, y: cy + px * sin + py * cos };
  };
  const tangent = (t: number) => {
    const dx = -rx * Math.sin(t);
    const dy = ry * Math.cos(t);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  };
  const start = point(startAngle);
  const segments = Math.ceil(Math.abs(sweep) / MAX_SEGMENT);
  const curves: CubicCommand[] = [];
  if (segments === 0) return { start, curves };
  const delta = sweep / segments;
  const k = (4 / 3) * Math.tan(delta / 4);
  let from = start;
  for (let i = 0; i < segments; i++) {
    const t0 = startAngle + i * delta;
    const t1 = t0 + delta;
    const to = point(t1);
    const d0 = tangent(t0);
    const d1 = tangent(t1);
    curves.push({
      op: 'C',
      x1: from.x + k * d0.x,
      y1: from.y + k * d0.y,
      x2: to.x - k * d1.x,
      y2: to.y - k * d1.y,
      x: to.x,
      y: to.y,
    });
    from = to;
  }
  return { start, curves };
}

/** The signed sweep of `arc()`/`ellipse()` from `start` to `end`, per the canvas spec. */
function arcSweep(start: number, end: number, counterclockwise: boolean): number {
  const TAU = Math.PI * 2;
  if (!counterclockwise && end - start >= TAU) return TAU;
  if (counterclockwise && start - end >= TAU) return -TAU;
  let sweep = (end - start) % TAU;
  if (!counterclockwise && sweep < 0) sweep += TAU;
  if (counterclockwise && sweep > 0) sweep -= TAU;
  return sweep;
}

// ---------------------------------------------------------------------------------------------
// Colour and font parsing

interface Rgba {
  hex: string;
  alpha: number;
}

const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const RGB_RE = /^rgba?\(([^)]*)\)$/;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const byteHex = (n: number) =>
  Math.min(255, Math.max(0, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

/** `#rgb[a]`, `#rrggbb[aa]`, `rgb[a](...)` and `transparent`; anything else is `null`. */
function parseCssColor(value: string): Rgba | null {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { hex: '#000000', alpha: 0 };
  const hex = HEX_RE.exec(v)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    return {
      hex: `#${full.slice(0, 6)}`,
      alpha: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1,
    };
  }
  const args = RGB_RE.exec(v)?.[1];
  if (args !== undefined) {
    const parts = args.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const channel = (p: string) => (p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p));
    const [r, g, b] = [channel(parts[0]), channel(parts[1]), channel(parts[2])];
    const a = parts[3];
    const alpha = a === undefined ? 1 : a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
    if (![r, g, b, alpha].every(Number.isFinite)) return null;
    return { hex: `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`, alpha: clamp01(alpha) };
  }
  return null;
}

const SIZE_RE = /^(\d*\.?\d+)(px|pt)(?:\/\S+)?$/;
const WEIGHT_WORDS: Record<string, number> = { normal: 400, bold: 700, bolder: 700, lighter: 100 };

/**
 * Reads a CSS font shorthand: `[style] [variant] [weight] [stretch] size[/line-height] family,...`.
 * `null` for what cannot be recorded: no size, a unit other than px/pt, `small-caps`, an unknown word.
 */
function parseFont(value: string): FontSpec | null {
  const tokens = value.trim().split(/\s+/);
  const sizeAt = tokens.findIndex((t) => SIZE_RE.test(t));
  if (sizeAt < 0) return null;
  let weight = 400;
  let style: FontSpec['style'] = 'normal';
  for (const token of tokens.slice(0, sizeAt)) {
    const word = token.toLowerCase();
    if (word === 'normal') continue;
    if (word === 'italic' || word === 'oblique') style = 'italic';
    else if (Object.hasOwn(WEIGHT_WORDS, word)) weight = WEIGHT_WORDS[word];
    else if (/^\d+$/.test(word) && Number(word) >= 1 && Number(word) <= 1000) weight = Number(word);
    else if (/^(ultra-|extra-|semi-)?(condensed|expanded)$/.test(word)) continue;
    else return null;
  }
  const [, amount, unit] = SIZE_RE.exec(tokens[sizeAt])!;
  const size = Number(amount) * (unit === 'pt' ? 4 / 3 : 1);
  const [family, ...fallback] = fontFamilies(tokens.slice(sizeAt + 1).join(' '));
  if (!family || !(size > 0)) return null;
  return { family, weight, style, size, ...(fallback.length > 0 && { fallback }) };
}

/** The families of a CSS `font-family` list, in order, unquoted. */
function fontFamilies(list: string): string[] {
  const names: string[] = [];
  const family = /\s*(?:"([^"]*)"|'([^']*)'|([^,]+?))\s*(?:,|$)/y;
  while (family.lastIndex < list.length) {
    const match = family.exec(list);
    if (!match) break;
    const name = match[1] ?? match[2] ?? match[3];
    if (name) names.push(name);
  }
  return names;
}

// ---------------------------------------------------------------------------------------------
// Paint objects handed out by createLinearGradient / createRadialGradient / createPattern

type GradientGeometry =
  | { type: 'linear'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'radial'; x0: number; y0: number; r0: number; x1: number; y1: number; r1: number };

class RecordedGradient {
  private readonly stops: ColorStop[] = [];

  constructor(
    private readonly geometry: GradientGeometry,
    private readonly resolveColor: (value: string) => Rgba | null,
    private readonly report: (call: string) => void
  ) {}

  addColorStop(offset: number, color: string): void {
    if (!(offset >= 0 && offset <= 1)) {
      throw new RangeError(`colour stop offset ${offset} is outside 0..1`);
    }
    const parsed = this.resolveColor(color);
    if (!parsed) {
      this.report(`color:${color}`);
      return;
    }
    this.stops.push({ offset, hex: parsed.hex, alpha: parsed.alpha });
  }

  /** `null` where a canvas paints nothing: no stops, or a degenerate geometry. */
  toPaint(): Paint | null {
    const first = this.stops[0];
    if (!first) return null;
    if (this.stops.length === 1) return { type: 'solid', hex: first.hex, alpha: first.alpha };
    const g = this.geometry;
    if (g.x0 === g.x1 && g.y0 === g.y1 && (g.type === 'linear' || g.r0 === g.r1)) return null;
    const stops = this.stops.map((s) => ({ ...s })).sort((a, b) => a.offset - b.offset);
    return { ...g, stops };
  }
}

class RecordedPattern {
  matrix: Matrix = IDENTITY;

  constructor(readonly image: SceneImageRef) {}

  setTransform(m?: { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number }) {
    this.matrix = m ? [m.a ?? 1, m.b ?? 0, m.c ?? 0, m.d ?? 1, m.e ?? 0, m.f ?? 0] : IDENTITY;
  }
}

// ---------------------------------------------------------------------------------------------
// State

type StyleSlot =
  | { kind: 'color'; raw: string; color: Rgba }
  | { kind: 'object'; raw: CanvasGradient | CanvasPattern };

interface State {
  matrix: Matrix;
  clips: readonly ClipPath[];
  fill: StyleSlot;
  stroke: StyleSlot;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  dash: number[];
  dashOffset: number;
  alpha: number;
  composite: string;
  filter: string;
  fontRaw: string;
  font: FontSpec;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  direction: CanvasDirection;
  letterSpacing: string;
  shadowColor: { raw: string; color: Rgba };
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  smoothing: boolean;
  smoothingQuality: ImageSmoothingQuality;
}

interface Segment {
  /** The CTM when the command was added. */
  m: Matrix;
  c: PathCommand;
}

const BLACK: StyleSlot = { kind: 'color', raw: '#000000', color: { hex: '#000000', alpha: 1 } };

const sameMatrix = (a: Matrix, b: Matrix) => a.every((v, i) => v === b[i]);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function samePaint(a: Paint, b: Paint): boolean {
  if (a.type === 'pattern' || b.type === 'pattern') {
    return (
      a.type === 'pattern' &&
      b.type === 'pattern' &&
      a.image === b.image &&
      sameMatrix(a.matrix, b.matrix)
    );
  }
  return sameJson(a, b);
}

function mapCommand(m: Matrix, c: PathCommand): PathCommand {
  switch (c.op) {
    case 'M':
    case 'L': {
      const p = apply(m, c.x, c.y);
      return { op: c.op, x: p.x, y: p.y };
    }
    case 'C': {
      const a = apply(m, c.x1, c.y1);
      const b = apply(m, c.x2, c.y2);
      const p = apply(m, c.x, c.y);
      return { op: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: p.x, y: p.y };
    }
    case 'Q': {
      const a = apply(m, c.x1, c.y1);
      const p = apply(m, c.x, c.y);
      return { op: 'Q', x1: a.x, y1: a.y, x: p.x, y: p.y };
    }
    case 'Z':
      return c;
  }
}

const finite = (...values: number[]) => values.every(Number.isFinite);

/** Width and height of an image source: natural size for an `<img>`, else the element's own. */
function sourceSize(image: CanvasImageSource): { width: number; height: number } {
  const el = image as {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
  };
  return { width: el.naturalWidth || el.width || 0, height: el.naturalHeight || el.height || 0 };
}

const imageData = (width: number, height: number): ImageData => {
  const w = Math.max(0, Math.trunc(width) || 0);
  const h = Math.max(0, Math.trunc(height) || 0);
  return {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
    colorSpace: 'srgb',
  } as ImageData;
};

// ---------------------------------------------------------------------------------------------

export class RecordingContext {
  readonly ops: SceneOp[] = [];
  readonly page: number;

  private readonly measure: CanvasRenderingContext2D;
  private readonly size: { width: number; height: number };
  private readonly onUnknown: (call: string) => void;
  private readonly colors = new Map<string, Rgba | null>();
  private readonly stack: State[] = [];

  private s: State = {
    matrix: IDENTITY,
    clips: [],
    fill: BLACK,
    stroke: BLACK,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    dash: [],
    dashOffset: 0,
    alpha: 1,
    composite: 'source-over',
    filter: 'none',
    fontRaw: '10px sans-serif',
    font: { family: 'sans-serif', weight: 400, style: 'normal', size: 10 },
    textAlign: 'start',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    letterSpacing: '0px',
    shadowColor: { raw: 'rgba(0, 0, 0, 0)', color: { hex: '#000000', alpha: 0 } },
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    smoothing: true,
    smoothingQuality: 'low',
  };

  private segs: Segment[] = [];
  /** Current point in device space; the user-space point is `inverse(CTM)` of it. */
  private cur: { x: number; y: number } | null = null;
  private subpathStart: { x: number; y: number } | null = null;

  constructor(options: RecordingContextOptions) {
    this.measure = options.measure;
    this.page = options.page;
    this.size = { width: options.width, height: options.height };
    this.onUnknown = options.onUnknown;
  }

  // -- state ------------------------------------------------------------------------------

  save(): void {
    this.stack.push({ ...this.s });
  }

  restore(): void {
    const previous = this.stack.pop();
    if (previous) this.s = previous;
  }

  get canvas(): HTMLCanvasElement {
    return { ...this.size } as unknown as HTMLCanvasElement;
  }

  get fillStyle(): string | CanvasGradient | CanvasPattern {
    return this.s.fill.raw;
  }
  set fillStyle(value: string | CanvasGradient | CanvasPattern) {
    const slot = this.styleSlot(value);
    if (slot) this.s.fill = slot;
  }

  get strokeStyle(): string | CanvasGradient | CanvasPattern {
    return this.s.stroke.raw;
  }
  set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
    const slot = this.styleSlot(value);
    if (slot) this.s.stroke = slot;
  }

  get lineWidth(): number {
    return this.s.lineWidth;
  }
  set lineWidth(value: number) {
    if (Number.isFinite(value) && value > 0) this.s.lineWidth = value;
  }

  get lineCap(): CanvasLineCap {
    return this.s.lineCap;
  }
  set lineCap(value: CanvasLineCap) {
    if (value === 'butt' || value === 'round' || value === 'square') this.s.lineCap = value;
  }

  get lineJoin(): CanvasLineJoin {
    return this.s.lineJoin;
  }
  set lineJoin(value: CanvasLineJoin) {
    if (value === 'round' || value === 'bevel' || value === 'miter') this.s.lineJoin = value;
  }

  get miterLimit(): number {
    return this.s.miterLimit;
  }
  set miterLimit(value: number) {
    if (Number.isFinite(value) && value > 0) this.s.miterLimit = value;
  }

  get lineDashOffset(): number {
    return this.s.dashOffset;
  }
  set lineDashOffset(value: number) {
    if (Number.isFinite(value)) this.s.dashOffset = value;
  }

  setLineDash(segments: Iterable<number>): void {
    const list = Array.from(segments);
    if (list.some((v) => !Number.isFinite(v) || v < 0)) return;
    this.s.dash = list.length % 2 === 1 ? [...list, ...list] : list;
  }

  getLineDash(): number[] {
    return [...this.s.dash];
  }

  get globalAlpha(): number {
    return this.s.alpha;
  }
  set globalAlpha(value: number) {
    if (value >= 0 && value <= 1) this.s.alpha = value;
  }

  get globalCompositeOperation(): GlobalCompositeOperation {
    return this.s.composite as GlobalCompositeOperation;
  }
  set globalCompositeOperation(value: GlobalCompositeOperation) {
    this.s.composite = String(value);
  }

  get filter(): string {
    return this.s.filter;
  }
  set filter(value: string) {
    this.s.filter = String(value);
  }

  get imageSmoothingEnabled(): boolean {
    return this.s.smoothing;
  }
  set imageSmoothingEnabled(value: boolean) {
    this.s.smoothing = Boolean(value);
  }

  get imageSmoothingQuality(): ImageSmoothingQuality {
    return this.s.smoothingQuality;
  }
  set imageSmoothingQuality(value: ImageSmoothingQuality) {
    this.s.smoothingQuality = value;
  }

  get shadowColor(): string {
    return this.s.shadowColor.raw;
  }
  set shadowColor(value: string) {
    const text = String(value);
    const color = this.parseColor(text);
    if (color) this.s.shadowColor = { raw: text, color };
    else this.onUnknown(`color:${text}`);
  }

  get shadowBlur(): number {
    return this.s.shadowBlur;
  }
  set shadowBlur(value: number) {
    if (Number.isFinite(value) && value >= 0) this.s.shadowBlur = value;
  }

  get shadowOffsetX(): number {
    return this.s.shadowOffsetX;
  }
  set shadowOffsetX(value: number) {
    if (Number.isFinite(value)) this.s.shadowOffsetX = value;
  }

  get shadowOffsetY(): number {
    return this.s.shadowOffsetY;
  }
  set shadowOffsetY(value: number) {
    if (Number.isFinite(value)) this.s.shadowOffsetY = value;
  }

  get font(): string {
    return this.s.fontRaw;
  }
  set font(value: string) {
    const text = String(value);
    const font = parseFont(text);
    if (font) {
      this.s.fontRaw = text;
      this.s.font = font;
    } else {
      this.onUnknown(`font:${text}`);
    }
  }

  get textAlign(): CanvasTextAlign {
    return this.s.textAlign;
  }
  set textAlign(value: CanvasTextAlign) {
    if (['start', 'end', 'left', 'right', 'center'].includes(value)) this.s.textAlign = value;
  }

  get textBaseline(): CanvasTextBaseline {
    return this.s.textBaseline;
  }
  set textBaseline(value: CanvasTextBaseline) {
    if (['top', 'hanging', 'middle', 'alphabetic', 'ideographic', 'bottom'].includes(value)) {
      this.s.textBaseline = value;
    }
  }

  get direction(): CanvasDirection {
    return this.s.direction;
  }
  set direction(value: CanvasDirection) {
    if (value === 'ltr' || value === 'rtl' || value === 'inherit') this.s.direction = value;
  }

  get letterSpacing(): string {
    return this.s.letterSpacing;
  }
  set letterSpacing(value: string) {
    this.s.letterSpacing = String(value);
  }

  // -- transform --------------------------------------------------------------------------

  getTransform(): DOMMatrix {
    const [a, b, c, d, e, f] = this.s.matrix;
    const isIdentity = sameMatrix(this.s.matrix, IDENTITY);
    return { a, b, c, d, e, f, is2D: true, isIdentity } as unknown as DOMMatrix;
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    if (finite(a, b, c, d, e, f)) this.s.matrix = [a, b, c, d, e, f];
  }

  resetTransform(): void {
    this.s.matrix = IDENTITY;
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    if (finite(a, b, c, d, e, f)) this.s.matrix = multiply(this.s.matrix, [a, b, c, d, e, f]);
  }

  translate(x: number, y: number): void {
    this.transform(1, 0, 0, 1, x, y);
  }

  scale(x: number, y: number): void {
    this.transform(x, 0, 0, y, 0, 0);
  }

  rotate(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.transform(cos, sin, -sin, cos, 0, 0);
  }

  // -- path construction ------------------------------------------------------------------

  beginPath(): void {
    this.segs = [];
    this.cur = null;
    this.subpathStart = null;
  }

  closePath(): void {
    if (this.segs.length > 0 && this.segs[this.segs.length - 1].c.op !== 'Z') this.add({ op: 'Z' });
  }

  moveTo(x: number, y: number): void {
    if (finite(x, y)) this.add({ op: 'M', x, y });
  }

  lineTo(x: number, y: number): void {
    if (!finite(x, y)) return;
    this.add({ op: this.segs.length === 0 ? 'M' : 'L', x, y });
  }

  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    if (!finite(x1, y1, x2, y2, x, y)) return;
    if (this.segs.length === 0) this.add({ op: 'M', x: x1, y: y1 });
    this.add({ op: 'C', x1, y1, x2, y2, x, y });
  }

  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void {
    if (!finite(x1, y1, x, y)) return;
    if (this.segs.length === 0) this.add({ op: 'M', x: x1, y: y1 });
    this.add({ op: 'Q', x1, y1, x, y });
  }

  rect(x: number, y: number, width: number, height: number): void {
    if (!finite(x, y, width, height)) return;
    for (const c of rectCommands(x, y, width, height)) this.add(c);
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise = false
  ): void {
    this.ellipse(x, y, radius, radius, 0, startAngle, endAngle, counterclockwise);
  }

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise = false
  ): void {
    if (!finite(x, y, radiusX, radiusY, rotation, startAngle, endAngle)) return;
    if (radiusX < 0 || radiusY < 0) return;
    const sweep = arcSweep(startAngle, endAngle, counterclockwise);
    const { start, curves } = arcToBeziers(x, y, radiusX, radiusY, rotation, startAngle, sweep);
    this.add({ op: this.segs.length === 0 ? 'M' : 'L', x: start.x, y: start.y });
    for (const c of curves) this.add(c);
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    if (!finite(x1, y1, x2, y2, radius) || radius < 0) return;
    if (this.segs.length === 0 || !this.cur) {
      this.add({ op: 'M', x: x1, y: y1 });
      return;
    }
    let p0: { x: number; y: number };
    try {
      p0 = apply(invert(this.s.matrix), this.cur.x, this.cur.y);
    } catch {
      return; // A singular CTM draws nothing.
    }
    const v1x = p0.x - x1;
    const v1y = p0.y - y1;
    const v2x = x2 - x1;
    const v2y = y2 - y1;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 === 0 || l2 === 0 || radius === 0 || v1x * v2y - v1y * v2x === 0) {
      this.add({ op: 'L', x: x1, y: y1 });
      return;
    }
    const u1x = v1x / l1;
    const u1y = v1y / l1;
    const u2x = v2x / l2;
    const u2y = v2y / l2;
    // The corner at (x1, y1) opens by `theta`; the circle touches both legs `t` from the corner.
    const theta = Math.acos(Math.min(1, Math.max(-1, u1x * u2x + u1y * u2y)));
    const t = radius / Math.tan(theta / 2);
    const bx = u1x + u2x;
    const by = u1y + u2y;
    const blen = Math.hypot(bx, by);
    const centreDistance = radius / Math.sin(theta / 2);
    const cx = x1 + (bx / blen) * centreDistance;
    const cy = y1 + (by / blen) * centreDistance;
    const t1 = { x: x1 + u1x * t, y: y1 + u1y * t };
    const t2 = { x: x1 + u2x * t, y: y1 + u2y * t };
    if (Math.hypot(t1.x - p0.x, t1.y - p0.y) > 1e-9) this.add({ op: 'L', x: t1.x, y: t1.y });
    const a1 = Math.atan2(t1.y - cy, t1.x - cx);
    const a2 = Math.atan2(t2.y - cy, t2.x - cx);
    // The arc is the short way round: less than half a turn.
    const sweep = ((((a2 - a1 + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    for (const c of arcToBeziers(cx, cy, radius, radius, 0, a1, sweep).curves) this.add(c);
  }

  roundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radii: number | DOMPointInit | (number | DOMPointInit)[] = 0
  ): void {
    if (!finite(x, y, width, height)) return;
    const list = Array.isArray(radii) ? radii : [radii];
    if (list.length < 1 || list.length > 4 || list.some((r) => typeof r !== 'number')) {
      this.onUnknown('roundRect:radii');
      return;
    }
    const r = list as number[];
    if (r.some((v) => !finite(v) || v < 0)) return;
    const [tl0, tr0, br0, bl0] =
      r.length === 1
        ? [r[0], r[0], r[0], r[0]]
        : r.length === 2
          ? [r[0], r[1], r[0], r[1]]
          : r.length === 3
            ? [r[0], r[1], r[2], r[1]]
            : r;
    const w = Math.abs(width);
    const h = Math.abs(height);
    const left = width < 0 ? x + width : x;
    const top = height < 0 ? y + height : y;
    // Radii that do not fit a side shrink together, as in the spec.
    const fit = (side: number, sum: number) => (sum > 0 ? side / sum : 1);
    const f = Math.min(
      1,
      fit(w, tl0 + tr0),
      fit(w, bl0 + br0),
      fit(h, tl0 + bl0),
      fit(h, tr0 + br0)
    );
    const [tl, tr, br, bl] = [tl0 * f, tr0 * f, br0 * f, bl0 * f];
    const corner = (cx: number, cy: number, radius: number, from: number) => {
      if (radius <= 0) return;
      for (const c of arcToBeziers(cx, cy, radius, radius, 0, from, Math.PI / 2).curves) {
        this.add(c);
      }
    };
    this.add({ op: 'M', x: left + tl, y: top });
    this.add({ op: 'L', x: left + w - tr, y: top });
    corner(left + w - tr, top + tr, tr, -Math.PI / 2);
    this.add({ op: 'L', x: left + w, y: top + h - br });
    corner(left + w - br, top + h - br, br, 0);
    this.add({ op: 'L', x: left + bl, y: top + h });
    corner(left + bl, top + h - bl, bl, Math.PI / 2);
    this.add({ op: 'L', x: left, y: top + tl });
    corner(left + tl, top + tl, tl, Math.PI);
    this.add({ op: 'Z' });
  }

  // -- painting ---------------------------------------------------------------------------

  fill(fillRule?: CanvasFillRule): void;
  fill(path: Path2D, fillRule?: CanvasFillRule): void;
  fill(first?: CanvasFillRule | Path2D, second?: CanvasFillRule): void {
    if (typeof first === 'object') return this.onUnknown('fill:path2d');
    this.drawPath('fill', this.segs, first ?? second ?? 'nonzero');
  }

  stroke(path?: Path2D): void {
    if (path) return this.onUnknown('stroke:path2d');
    this.drawPath('stroke', this.segs, 'nonzero');
  }

  clip(fillRule?: CanvasFillRule): void;
  clip(path: Path2D, fillRule?: CanvasFillRule): void;
  clip(first?: CanvasFillRule | Path2D, second?: CanvasFillRule): void {
    if (typeof first === 'object') return this.onUnknown('clip:path2d');
    // An empty or degenerate path clips everything away, as on a canvas.
    const path = this.inCallSpace(this.segs);
    this.s.clips = [
      ...this.s.clips,
      {
        matrix: this.s.matrix,
        commands: path ?? [],
        rule: first ?? second ?? 'nonzero',
      },
    ];
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    if (!finite(x, y, width, height) || width === 0 || height === 0) return;
    this.drawPath('fill', this.rectSegments(x, y, width, height), 'nonzero');
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    if (!finite(x, y, width, height) || (width === 0 && height === 0)) return;
    this.drawPath('stroke', this.rectSegments(x, y, width, height), 'nonzero');
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    const [a, b, c, d, e, f] = this.s.matrix;
    const left = Math.min(x, x + width);
    const right = Math.max(x, x + width);
    const top = Math.min(y, y + height);
    const bottom = Math.max(y, y + height);
    const coversCanvas =
      b === 0 &&
      c === 0 &&
      a > 0 &&
      d > 0 &&
      this.s.clips.length === 0 &&
      left * a + e <= 0 &&
      top * d + f <= 0 &&
      right * a + e >= this.size.width &&
      bottom * d + f >= this.size.height;
    // The recording starts empty, so clearing all of it changes nothing.
    if (!coversCanvas) this.onUnknown('clearRect');
  }

  // -- text -------------------------------------------------------------------------------

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.drawText('fill', text, x, y, maxWidth);
  }

  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.drawText('stroke', text, x, y, maxWidth);
  }

  measureText(text: string): TextMetrics {
    this.syncMeasure();
    return this.measure.measureText(text);
  }

  // -- images, gradients, patterns --------------------------------------------------------

  drawImage(image: CanvasImageSource, dx: number, dy: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
  drawImage(image: CanvasImageSource, ...n: number[]): void {
    const size = sourceSize(image);
    let rect: [number, number, number, number, number, number, number, number];
    if (n.length === 2) rect = [0, 0, size.width, size.height, n[0], n[1], size.width, size.height];
    else if (n.length === 4) rect = [0, 0, size.width, size.height, n[0], n[1], n[2], n[3]];
    else if (n.length === 8) rect = n as typeof rect;
    else return;
    if (!finite(...rect)) return;
    this.effects();
    const [sx, sy, sw, sh, dx, dy, dw, dh] = rect;
    this.ops.push({
      kind: 'image',
      image: { kind: 'element', element: image, ...size },
      sx,
      sy,
      sw,
      sh,
      dx,
      dy,
      dw,
      dh,
      ...this.base(this.s.matrix),
    });
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    return this.gradient({ type: 'linear', x0, y0, x1, y1 });
  }

  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): CanvasGradient {
    return this.gradient({ type: 'radial', x0, y0, r0, x1, y1, r1 });
  }

  createPattern(image: CanvasImageSource, repetition: string | null): CanvasPattern | null {
    const repeat = repetition === null || repetition === '' ? 'repeat' : repetition;
    if (repeat !== 'repeat') {
      this.onUnknown(`createPattern:${repeat}`);
      return null;
    }
    const ref: SceneImageRef = { kind: 'element', element: image, ...sourceSize(image) };
    return new RecordedPattern(ref) as unknown as CanvasPattern;
  }

  // -- pixel access: not modelled ---------------------------------------------------------

  getImageData(_sx: number, _sy: number, sw: number, sh: number): ImageData {
    this.onUnknown('getImageData');
    return imageData(Math.abs(sw), Math.abs(sh));
  }

  putImageData(_imageData: ImageData, _dx: number, _dy: number, ..._dirty: number[]): void {
    this.onUnknown('putImageData');
  }

  createImageData(sw: number | ImageData, sh?: number): ImageData {
    return typeof sw === 'number'
      ? imageData(Math.abs(sw), Math.abs(sh ?? 0))
      : imageData(sw.width, sw.height);
  }

  isPointInPath(x: number, y: number, fillRule?: CanvasFillRule): boolean;
  isPointInPath(path: Path2D, x: number, y: number, fillRule?: CanvasFillRule): boolean;
  isPointInPath(..._args: unknown[]): boolean {
    return false;
  }

  // -- internals --------------------------------------------------------------------------

  private add(c: PathCommand): void {
    this.segs.push({ m: this.s.matrix, c });
    if (c.op === 'Z') {
      this.cur = this.subpathStart;
      return;
    }
    const p = apply(this.s.matrix, c.x, c.y);
    this.cur = p;
    if (c.op === 'M') this.subpathStart = p;
  }

  private rectSegments(x: number, y: number, width: number, height: number): Segment[] {
    return rectCommands(x, y, width, height).map((c) => ({ m: this.s.matrix, c }));
  }

  /**
   * The path as commands in the user space of the current CTM, or `null` when it draws nothing:
   * no segment beyond moves, or a singular CTM that cannot be inverted.
   */
  private inCallSpace(segs: readonly Segment[]): PathCommand[] | null {
    if (!segs.some((s) => s.c.op !== 'M')) return null;
    const ctm = this.s.matrix;
    if (segs.every((s) => s.c.op === 'Z' || sameMatrix(s.m, ctm))) return segs.map((s) => s.c);
    let inverse: Matrix;
    try {
      inverse = invert(ctm);
    } catch {
      return null;
    }
    let seen: Matrix | null = null;
    let combined: Matrix = IDENTITY;
    return segs.map((s) => {
      if (s.m !== seen) {
        seen = s.m;
        combined = multiply(inverse, s.m);
      }
      return mapCommand(combined, s.c);
    });
  }

  private drawPath(mode: 'fill' | 'stroke', segs: readonly Segment[], rule: CanvasFillRule): void {
    this.effects();
    const paint = this.paintOf(mode === 'fill' ? 'fillStyle' : 'strokeStyle');
    const commands = this.inCallSpace(segs);
    if (!paint || !commands) return;
    this.ops.push({
      kind: 'path',
      mode,
      commands,
      rule,
      paint,
      stroke: mode === 'stroke' ? this.strokeState() : null,
      ...this.base(this.s.matrix),
    });
  }

  private drawText(
    mode: 'fill' | 'stroke',
    text: string,
    x: number,
    y: number,
    maxWidth: number | undefined
  ): void {
    if (text === '' || !finite(x, y)) return;
    this.effects();
    const s = this.s;
    if (parseFloat(s.letterSpacing) !== 0) this.onUnknown('letterSpacing');
    if (s.direction === 'rtl') this.onUnknown('direction:rtl');
    const paint = this.paintOf(mode === 'fill' ? 'fillStyle' : 'strokeStyle');
    if (!paint) return;

    this.syncMeasure();
    const aligned = s.textAlign === 'center' || s.textAlign === 'right' || s.textAlign === 'end';
    const needsMetrics = aligned || maxWidth !== undefined || s.textBaseline !== 'alphabetic';
    const metrics = needsMetrics ? this.measure.measureText(text) : null;
    if (metrics && maxWidth !== undefined && metrics.width > maxWidth) {
      this.onUnknown(`${mode === 'fill' ? 'fillText' : 'strokeText'}:maxWidth`);
    }

    // The IR is always at the alphabetic baseline. `alphabeticBaseline` is the distance from the
    // line `textBaseline` names UP to the alphabetic baseline, so it is subtracted in y-down space.
    let baselineShift = 0;
    if (metrics && s.textBaseline !== 'alphabetic') {
      if (Number.isFinite(metrics.alphabeticBaseline)) baselineShift = metrics.alphabeticBaseline;
      else this.onUnknown('measureText:alphabeticBaseline');
    }
    const baseline = y - baselineShift;

    const width = metrics ? metrics.width : 0;
    const x0 = s.textAlign === 'center' ? x - width / 2 : aligned ? x - width : x;
    const chars = Array.from(text);
    const xs = [x0];
    for (let i = 1; i < chars.length; i++) {
      const through = this.measure.measureText(chars.slice(0, i + 1).join('')).width;
      xs.push(x0 + through - this.measure.measureText(chars[i]).width);
    }

    const base = this.base(s.matrix);
    const stroke = mode === 'stroke' ? this.strokeState() : null;
    const last = this.ops[this.ops.length - 1];
    if (
      last?.kind === 'text' &&
      last.mode === mode &&
      last.y === baseline &&
      last.alpha === base.alpha &&
      sameMatrix(last.matrix, base.matrix) &&
      last.clips.length === base.clips.length &&
      last.clips.every((c, i) => c === base.clips[i]) &&
      sameJson(last.shadow, base.shadow) &&
      sameJson(last.font, s.font) &&
      sameJson(last.stroke, stroke) &&
      samePaint(last.paint, paint)
    ) {
      last.text += text;
      last.xs.push(...xs);
      return;
    }
    this.ops.push({
      kind: 'text',
      mode,
      text,
      xs,
      y: baseline,
      font: s.font,
      paint,
      stroke,
      ...base,
    });
  }

  /** What the canvas would apply that the IR cannot express. */
  private effects(): void {
    if (this.s.composite !== 'source-over') {
      this.onUnknown(`globalCompositeOperation:${this.s.composite}`);
    }
    if (this.s.filter !== 'none') this.onUnknown(`filter:${this.s.filter}`);
  }

  private base(matrix: Matrix): {
    matrix: Matrix;
    alpha: number;
    clips: readonly ClipPath[];
    shadow: Shadow | null;
  } {
    return { matrix, alpha: this.s.alpha, clips: this.s.clips, shadow: this.shadowState() };
  }

  private shadowState(): Shadow | null {
    const s = this.s;
    const { hex, alpha } = s.shadowColor.color;
    if (alpha === 0) return null;
    if (s.shadowBlur === 0 && s.shadowOffsetX === 0 && s.shadowOffsetY === 0) return null;
    return { hex, alpha, blur: s.shadowBlur, offsetX: s.shadowOffsetX, offsetY: s.shadowOffsetY };
  }

  private strokeState(): StrokeStyle {
    const s = this.s;
    return {
      width: s.lineWidth,
      cap: s.lineCap,
      join: s.lineJoin,
      miterLimit: s.miterLimit,
      dash: [...s.dash],
      dashOffset: s.dashOffset,
    };
  }

  private paintOf(which: 'fillStyle' | 'strokeStyle'): Paint | null {
    const slot = which === 'fillStyle' ? this.s.fill : this.s.stroke;
    if (slot.kind === 'color') return { type: 'solid', ...slot.color };
    const raw: unknown = slot.raw;
    if (raw instanceof RecordedGradient) return raw.toPaint();
    if (raw instanceof RecordedPattern) {
      return { type: 'pattern', image: raw.image, repeat: 'repeat', matrix: raw.matrix };
    }
    // Konva makes its own gradients and patterns on a private native context; they cannot be read.
    this.onUnknown(`${which}:foreign-paint`);
    return null;
  }

  private styleSlot(value: unknown): StyleSlot | null {
    if (typeof value === 'object' && value !== null) {
      return { kind: 'object', raw: value as CanvasGradient | CanvasPattern };
    }
    const text = String(value);
    const color = this.parseColor(text);
    if (color) return { kind: 'color', raw: text, color };
    this.onUnknown(`color:${text}`);
    return null;
  }

  private gradient(geometry: GradientGeometry): CanvasGradient {
    const gradient = new RecordedGradient(
      geometry,
      (value) => this.parseColor(value),
      this.onUnknown
    );
    return gradient as unknown as CanvasGradient;
  }

  /** Our own parser first; names, `hsl()` and the like are canonicalised by the measuring context. */
  private parseColor(value: string): Rgba | null {
    const known = this.colors.get(value);
    if (known !== undefined) return known;
    let color = parseCssColor(value);
    if (!color) {
      const sentinel = '#010203';
      this.measure.fillStyle = sentinel;
      this.measure.fillStyle = value;
      const canonical = String(this.measure.fillStyle);
      color = canonical === sentinel ? null : parseCssColor(canonical);
    }
    this.colors.set(value, color);
    return color;
  }

  private syncMeasure(): void {
    const m = this.measure;
    m.font = this.s.fontRaw;
    m.textAlign = this.s.textAlign;
    m.textBaseline = this.s.textBaseline;
    m.letterSpacing = this.s.letterSpacing;
    m.direction = this.s.direction;
  }
}

function rectCommands(x: number, y: number, width: number, height: number): PathCommand[] {
  return [
    { op: 'M', x, y },
    { op: 'L', x: x + width, y },
    { op: 'L', x: x + width, y: y + height },
    { op: 'L', x, y: y + height },
    { op: 'Z' },
  ];
}
