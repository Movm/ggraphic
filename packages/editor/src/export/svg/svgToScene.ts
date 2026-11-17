// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Converts the markup of an SVG image into scene ops (`../scene/types.ts`): the same path, text
 * and group ops the recorder makes from a canvas, with absolute matrices, paints and clips. A
 * writer that cannot embed SVG (the PDF writer) draws icons, illustrations and charts with them.
 *
 * What it reads: shapes, `g`/`a`/`use`/`symbol`/nested `svg`, `transform`, `viewBox` and
 * `preserveAspectRatio`, presentation attributes, `style` and `<style>` rules (selectors are
 * matched by the DOM), inheritance, solid colours, linear and radial gradients, `clipPath` in
 * user space, and text with `tspan`, per-glyph positions and `text-anchor`.
 *
 * What it does not read is NOT dropped quietly. Every construct it skips or cannot reproduce adds
 * a name to `unsupported` (an element, a property or a feature), once; the caller rasters the
 * image when the list is not empty. The ops it returns are best effort in that case.
 *
 * Conventions of the result:
 * - `box.matrix` maps the box (`0..width` by `0..height`) to the page; the SVG viewport is fitted
 *   into the box by `viewBox` and `preserveAspectRatio`. The box is the image at its natural size
 *   (what a canvas draws before it crops and stretches, as `writeSvg` does for its nested `<svg>`);
 *   a stretch to the destination rect is part of `box.matrix`, a crop is a clip on the caller's
 *   side. Every op carries its full matrix, and its commands are in the user space of that matrix,
 *   as the recorder leaves them.
 * - `opacity` on one op is its `alpha`; on several it is a `group` with identity matrix, whose
 *   ops keep their own matrices and clips, as in a replayed page.
 * - A radial gradient in a box that is not square is an ellipse. The IR has circles only, so such
 *   a fill is emitted in the space of the gradient (matrix and commands both adjusted).
 * - Text is one op per run of equal style and baseline, with one x per code point. Glyph advances
 *   come from `defaults.measure`; without it a glyph is 0.6 em wide. The PDF writer lays text out
 *   again from the font file, the advances here only place the run (`text-anchor`, `tspan` flow).
 */
import { IDENTITY, apply, invert, multiply } from '../scene/matrix.js';
import { fontFamilies } from '../scene/recordingContext.js';
import { parseSvgColor } from './svgColor.js';
import {
  commandBounds,
  ellipseCommands,
  parseNumberList,
  parsePathData,
  parseTransform,
  pointsCommands,
  rectCommands,
  transformCommands,
  type Bounds,
} from './svgPathData.js';

import type {
  ClipPath,
  ColorStop,
  FontSpec,
  Matrix,
  Paint,
  PathCommand,
  SceneOp,
  StrokeStyle,
} from '../scene/types.js';

export interface SvgToSceneBox {
  /** Maps the box (0..width, 0..height) to page px. */
  matrix: Matrix;
  width: number;
  height: number;
}

export interface SvgToSceneDefaults {
  /** What the SVG inherits where it says nothing: family, fallback list, weight, style and size. */
  font: FontSpec;
  /** Advance of every code point of `text` in `font`; used to anchor and flow text. */
  measure?: (text: string, font: FontSpec) => number[];
}

export interface SvgToSceneResult {
  ops: SceneOp[];
  /** Elements, properties and features that were skipped or could not be reproduced. */
  unsupported: string[];
}

export function svgToScene(
  markup: string,
  box: SvgToSceneBox,
  defaults: SvgToSceneDefaults
): SvgToSceneResult {
  return new Converter(box, defaults).run(markup);
}

// ---------------------------------------------------------------------------------------------
// Vocabulary

const SVG_NS = 'http://www.w3.org/2000/svg';

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
/** Elements that draw, or hold what draws. */
const DRAWN = new Set([...SHAPES, 'svg', 'g', 'a', 'use', 'text']);
/** Everything else this converter knows. Any other element is unsupported wherever it stands. */
const KNOWN = new Set([
  ...DRAWN,
  ...['defs', 'symbol', 'clipPath', 'linearGradient', 'radialGradient', 'stop', 'tspan'],
  ...['style', 'title', 'desc', 'metadata'],
]);

/** Properties that inherit; kept as specified and read where they are used. */
const INHERITED = [
  ...['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width'],
  ...['stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray'],
  ...['stroke-dashoffset', 'paint-order', 'clip-rule', 'visibility', 'color'],
  ...['font-family', 'font-style', 'text-anchor', 'dominant-baseline', 'text-decoration'],
  ...['letter-spacing', 'word-spacing', 'writing-mode', 'white-space'],
  ...['marker-start', 'marker-mid', 'marker-end'],
];
/** Every presentation attribute that is read; the inherited ones, font size and weight, and: */
const PRESENTATION = [
  ...INHERITED,
  ...['font-size', 'font-weight', 'opacity', 'display', 'clip-path', 'overflow'],
  ...['stop-color', 'stop-opacity', 'filter', 'mask', 'vector-effect', 'mix-blend-mode'],
];
/** CSS properties that are not read at all (a shorthand, a different transform syntax). */
const CSS_NOT_READ = new Set(['font', 'transform']);

const GENERIC_FAMILIES = new Set([
  ...['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'math', 'emoji'],
  ...['ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'fangsong'],
  ...['-apple-system', 'blinkmacsystemfont'],
]);

/**
 * Where `dominant-baseline` puts the alphabetic baseline below `y`, in em. Approximations: the
 * metrics of the font are not at hand here, and the PDF writer re-lays text from the file.
 */
const BASELINE_SHIFT: Record<string, number> = {
  auto: 0,
  alphabetic: 0,
  'use-script': 0,
  'no-change': 0,
  'reset-size': 0,
  central: 0.35,
  middle: 0.3,
  hanging: 0.8,
  'text-before-edge': 0.9,
  'text-top': 0.9,
};

/** More elements than this are a bomb (`use` chains that double), not a drawing. */
const MAX_ELEMENTS = 20_000;
const GLYPH_WIDTH_EM = 0.6;

// ---------------------------------------------------------------------------------------------
// Small parsers

const LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(px|pt|pc|mm|cm|in|em|ex|rem|%)?$/;
const FRACTION = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(%?)\s*$/;

/** `0.5` and `50%` are both 0.5; `null` for anything else. */
function fraction(value: string | null | undefined): number | null {
  if (value == null) return null;
  const match = FRACTION.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? (match[2] ? n / 100 : n) : null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const unitNumber = (value: string | undefined, fallback: number) =>
  clamp01(fraction(value) ?? fallback);

/** `-0` becomes `0`: the same matrix must compare equal however it was composed. */
const tidy = (m: Matrix): Matrix => [m[0] + 0, m[1] + 0, m[2] + 0, m[3] + 0, m[4] + 0, m[5] + 0];
const translation = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];

/** The id in `url(#id)`; `null` for `none`, an external reference or anything else. */
function referencedId(value: string | null | undefined): string | null {
  return value ? (/^url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/.exec(value.trim())?.[2] ?? null) : null;
}

/** Splits at `separator` outside parentheses and quotes. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === separator && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts;
}

function parseDeclarations(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of splitTop(text, ';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!\s*important\s*$/i, '')
      .trim();
    if (name && value) out.push([name, value]);
  }
  return out;
}

interface Rule {
  selector: string;
  specificity: number;
  order: number;
  declarations: [string, string][];
}

function specificity(selector: string): number {
  const flat = selector.replace(/\[[^\]]*\]/g, '[]');
  const ids = flat.match(/#[\w-]+/g)?.length ?? 0;
  const classes = flat.match(/\.[\w-]+|\[\]|:(?!:)[\w-]+/g)?.length ?? 0;
  const types = flat.match(/(?:^|[\s>+~(])[a-zA-Z][\w-]*/g)?.length ?? 0;
  return ids * 10_000 + classes * 100 + types;
}

/** The index of the `}` that closes the `{` at `open`, or the end of the text. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return text.length;
}

/**
 * Style rules in source order. `@font-face` is read as nothing (the fonts are the writer's
 * business); any other at-rule is unsupported by name, and its rules are not applied.
 */
function parseStyleSheet(css: string, unsupported: Set<string>, firstOrder: number): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length) break;
    if (text[i] === '@') {
      const name = /^@[\w-]+/.exec(text.slice(i))?.[0].toLowerCase() ?? '@';
      if (name !== '@font-face') unsupported.add(name);
      const semicolon = text.indexOf(';', i);
      const open = text.indexOf('{', i);
      i =
        open >= 0 && (semicolon < 0 || open < semicolon)
          ? closingBrace(text, open) + 1
          : semicolon < 0
            ? text.length
            : semicolon + 1;
      continue;
    }
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const close = closingBrace(text, open);
    const declarations = parseDeclarations(text.slice(open + 1, close));
    for (const selector of splitTop(text.slice(i, open), ',')) {
      const trimmed = selector.trim();
      if (trimmed) {
        rules.push({
          selector: trimmed,
          specificity: specificity(trimmed),
          order: firstOrder + rules.length,
          declarations,
        });
      }
    }
    i = close + 1;
  }
  return rules;
}

/** `viewBox` as `[x, y, width, height]`; `null` when absent or unusable (which turns it off). */
function parseViewBox(value: string | null): [number, number, number, number] | null {
  const numbers = value ? parseNumberList(value) : null;
  if (!numbers || numbers.length !== 4 || !(numbers[2]! > 0) || !(numbers[3]! > 0)) return null;
  return [numbers[0]!, numbers[1]!, numbers[2]!, numbers[3]!];
}

/** `viewBox` into a `width` by `height` viewport, per `preserveAspectRatio`. */
function fitViewBox(
  viewBox: [number, number, number, number] | null,
  aspect: string | null,
  width: number,
  height: number,
  intrinsic: { width: number | null; height: number | null } | null
): { matrix: Matrix; slice: boolean } {
  if (!viewBox) {
    // No viewBox: the width and height attributes are the size of the image, stretched to fit.
    const sx = intrinsic?.width ? width / intrinsic.width : 1;
    const sy = intrinsic?.height ? height / intrinsic.height : 1;
    return { matrix: [sx, 0, 0, sy, 0, 0], slice: false };
  }
  const [vx, vy, vw, vh] = viewBox;
  const words = (aspect ?? '').trim().split(/\s+/).filter(Boolean);
  if (words[0] === 'defer') words.shift();
  const align = words[0] && words[0] !== 'meet' && words[0] !== 'slice' ? words[0] : 'xMidYMid';
  const slice = words.includes('slice');
  if (align === 'none') {
    const [sx, sy] = [width / vw, height / vh];
    return { matrix: [sx, 0, 0, sy, 0 - vx * sx, 0 - vy * sy], slice: false };
  }
  const scale = slice ? Math.max(width / vw, height / vh) : Math.min(width / vw, height / vh);
  const alignX = align.startsWith('xMin') ? 0 : align.startsWith('xMax') ? 1 : 0.5;
  const alignY = align.endsWith('YMin') ? 0 : align.endsWith('YMax') ? 1 : 0.5;
  return {
    matrix: [
      scale,
      0,
      0,
      scale,
      (width - vw * scale) * alignX - vx * scale,
      (height - vh * scale) * alignY - vy * scale,
    ],
    slice,
  };
}

function fontWeightOf(value: string | undefined, parent: number): number {
  switch (value?.toLowerCase()) {
    case undefined:
      return parent;
    case 'normal':
      return 400;
    case 'bold':
      return 700;
    case 'bolder':
      return parent < 400 ? 400 : parent < 600 ? 700 : 900;
    case 'lighter':
      return parent < 600 ? 100 : parent < 800 ? 400 : 700;
    default: {
      const n = Number(value);
      return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : parent;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The converter

/** What a node inherits and the user space it is drawn in. */
interface Ctx {
  matrix: Matrix;
  clips: readonly ClipPath[];
  /** The inherited properties, as specified (`font-size` and `font-weight` are resolved below). */
  style: Readonly<Record<string, string>>;
  fontSize: number;
  fontWeight: number;
  /** The size percentages refer to. */
  viewport: { width: number; height: number };
}

/** A paint, and the matrix the shape has to be drawn under for it (`null`: its own). */
interface Resolved {
  paint: Paint;
  fold: Matrix | null;
}

/** The style of a stretch of text, shared by its glyphs. */
interface Run {
  key: string;
  font: FontSpec;
  fill: Resolved | null;
  stroke: Resolved | null;
  strokeStyle: StrokeStyle | null;
  strokeFirst: boolean;
  anchor: string;
  shift: number;
}

interface Glyph {
  char: string;
  x: number;
  y: number;
  advance: number;
  run: Run;
  chunk: number;
}

class Converter {
  private readonly unsupported = new Set<string>();
  private readonly rules: Rule[] = [];
  private readonly ids = new Map<string, Element>();
  private readonly specifiedCache = new Map<Element, Map<string, string>>();
  private readonly badSelectors = new Set<string>();
  /** The elements being drawn: an element that refers to itself is not drawn again. */
  private readonly active = new Set<Element>();
  private count = 0;
  private root: Element | null = null;

  constructor(
    private readonly box: SvgToSceneBox,
    private readonly defaults: SvgToSceneDefaults
  ) {}

  run(markup: string): SvgToSceneResult {
    const root = this.parse(markup);
    if (!root) return { ops: [], unsupported: ['document'] };
    this.root = root;
    this.index(root);
    const ctx: Ctx = {
      matrix: this.box.matrix,
      clips: [],
      style: {},
      fontSize: this.defaults.font.size,
      fontWeight: this.defaults.font.weight,
      viewport: { width: this.box.width, height: this.box.height },
    };
    const ops: SceneOp[] = [];
    this.element(root, ctx, ops);
    return { ops, unsupported: [...this.unsupported] };
  }

  // -- the document ------------------------------------------------------------------------

  private parse(markup: string): Element | null {
    if (typeof DOMParser === 'undefined') return null;
    let document: Document;
    try {
      document = new DOMParser().parseFromString(markup, 'image/svg+xml');
    } catch {
      return null;
    }
    const root = document.documentElement as Element | null;
    if (
      !root ||
      root.namespaceURI !== SVG_NS ||
      root.localName !== 'svg' ||
      document.getElementsByTagName('parsererror').length > 0
    ) {
      return null;
    }
    return root;
  }

  /** One pass: unknown elements, ids, style sheets. */
  private index(root: Element): void {
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
      if (el.namespaceURI !== SVG_NS) continue;
      if (!KNOWN.has(el.localName)) this.unsupported.add(el.localName);
      const id = el.getAttribute('id');
      if (id && !this.ids.has(id)) this.ids.set(id, el);
      if (el.localName === 'style') {
        const type = el.getAttribute('type');
        if (!type || type === 'text/css') {
          this.rules.push(
            ...parseStyleSheet(el.textContent ?? '', this.unsupported, this.rules.length)
          );
        }
      }
    }
    this.rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
  }

  private matches(el: Element, selector: string): boolean {
    if (this.badSelectors.has(selector)) return false;
    try {
      return el.matches(selector);
    } catch {
      this.badSelectors.add(selector);
      this.unsupported.add('css-selector');
      return false;
    }
  }

  /**
   * The properties set on an element: presentation attributes, then the style sheet by
   * specificity, then the `style` attribute.
   */
  private specified(el: Element): Map<string, string> {
    const cached = this.specifiedCache.get(el);
    if (cached) return cached;
    const own = new Map<string, string>();
    for (const name of PRESENTATION) {
      const value = el.getAttribute(name);
      if (value !== null) own.set(name, value.trim());
    }
    const declare = (name: string, value: string) => {
      if (CSS_NOT_READ.has(name)) this.unsupported.add(name);
      else if (/\bvar\(/i.test(value)) this.unsupported.add('css-variable');
      else own.set(name, value);
    };
    for (const rule of this.rules) {
      if (!this.matches(el, rule.selector)) continue;
      for (const [name, value] of rule.declarations) declare(name, value);
    }
    for (const [name, value] of parseDeclarations(el.getAttribute('style') ?? '')) {
      declare(name, value);
    }
    this.specifiedCache.set(el, own);
    return own;
  }

  // -- context -----------------------------------------------------------------------------

  /** Inheritance only; the transform and the clip come after. */
  private derive(own: Map<string, string>, parent: Ctx): Ctx {
    const style: Record<string, string> = { ...parent.style };
    for (const name of INHERITED) {
      const value = own.get(name);
      if (value !== undefined && value !== 'inherit') style[name] = value;
    }
    const size = own.get('font-size');
    return {
      ...parent,
      style,
      fontSize: size === undefined ? parent.fontSize : this.fontSizeOf(size, parent),
      fontWeight: fontWeightOf(own.get('font-weight'), parent.fontWeight),
    };
  }

  private fontSizeOf(value: string, parent: Ctx): number {
    const percent = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(value);
    const size = percent
      ? (Number(percent[1]) / 100) * parent.fontSize
      : this.length(value, 'x', parent);
    if (size === null || !(size > 0)) {
      this.unsupported.add('font-size');
      return parent.fontSize;
    }
    return size;
  }

  /** A length in user units; percentages refer to the viewport. `null` if it is not a length. */
  private length(
    value: string | null | undefined,
    axis: 'x' | 'y' | 'xy',
    ctx: Ctx
  ): number | null {
    if (value == null) return null;
    const match = LENGTH.exec(value.trim());
    if (!match) return null;
    const n = Number(match[1]);
    if (!Number.isFinite(n)) return null;
    const { width, height } = ctx.viewport;
    switch (match[2]) {
      case undefined:
      case 'px':
        return n;
      case 'pt':
        return (n * 4) / 3;
      case 'pc':
        return n * 16;
      case 'mm':
        return (n * 96) / 25.4;
      case 'cm':
        return (n * 96) / 2.54;
      case 'in':
        return n * 96;
      case 'em':
        return n * ctx.fontSize;
      case 'ex':
        return (n * ctx.fontSize) / 2;
      case 'rem':
        return n * 16;
      default:
        return (
          (n / 100) *
          (axis === 'x' ? width : axis === 'y' ? height : Math.hypot(width, height) / Math.SQRT2)
        );
    }
  }

  private transform(el: Element): Matrix {
    const value = el.getAttribute('transform');
    if (value === null) return IDENTITY;
    const matrix = parseTransform(value);
    if (!matrix) {
      this.unsupported.add('transform');
      return IDENTITY;
    }
    return matrix;
  }

  /** Properties no op can express; named, the element is still drawn as well as it can be. */
  private flagProperties(own: Map<string, string>, ctx: Ctx, name: string): void {
    const flag = (property: string, off: string) => {
      const value = own.get(property);
      if (value !== undefined && value !== off) this.unsupported.add(property);
    };
    flag('filter', 'none');
    flag('mask', 'none');
    flag('mix-blend-mode', 'normal');
    if (!SHAPES.has(name)) return;
    flag('vector-effect', 'none');
    if (name !== 'rect' && name !== 'circle' && name !== 'ellipse') {
      for (const property of ['marker-start', 'marker-mid', 'marker-end']) {
        const value = ctx.style[property];
        if (value && value !== 'none') this.unsupported.add('marker');
      }
    }
  }

  // -- elements ----------------------------------------------------------------------------

  private children(el: Element, ctx: Ctx, out: SceneOp[]): void {
    for (const child of Array.from(el.children)) this.element(child, ctx, out);
  }

  private element(el: Element, parent: Ctx, out: SceneOp[]): void {
    if (el.namespaceURI !== SVG_NS || !DRAWN.has(el.localName) || this.active.has(el)) return;
    if (++this.count > MAX_ELEMENTS) {
      this.unsupported.add('size');
      return;
    }
    const own = this.specified(el);
    if (el !== this.root && own.get('display') === 'none') return;
    const opacity = unitNumber(own.get('opacity'), 1);
    if (opacity <= 0) return;

    let ctx = this.derive(own, parent);
    ctx = { ...ctx, matrix: tidy(multiply(ctx.matrix, this.transform(el))) };
    this.flagProperties(own, ctx, el.localName);
    const clip = this.clipPath(own.get('clip-path'), ctx);
    if (clip) ctx = { ...ctx, clips: [...ctx.clips, clip] };

    const local: SceneOp[] = [];
    this.active.add(el);
    try {
      switch (el.localName) {
        case 'svg': {
          const root = el === this.root;
          const x = root ? 0 : (this.length(el.getAttribute('x'), 'x', ctx) ?? 0);
          const y = root ? 0 : (this.length(el.getAttribute('y'), 'y', ctx) ?? 0);
          const width = root
            ? this.box.width
            : this.length(el.getAttribute('width') ?? '100%', 'x', ctx);
          const height = root
            ? this.box.height
            : this.length(el.getAttribute('height') ?? '100%', 'y', ctx);
          const clipOverflow = !root && !this.overflows(own);
          const inner =
            width === null || height === null
              ? null
              : this.viewport(el, ctx, x, y, width, height, clipOverflow, root);
          if (inner) this.children(el, inner, local);
          break;
        }
        case 'g':
        case 'a':
          this.children(el, ctx, local);
          break;
        case 'use':
          this.use(el, ctx, local);
          break;
        case 'text':
          this.text(el, ctx, local);
          break;
        default:
          this.shape(el, ctx, local);
      }
    } finally {
      this.active.delete(el);
    }
    out.push(...withOpacity(local, opacity));
  }

  private overflows(own: Map<string, string>): boolean {
    const overflow = own.get('overflow');
    return overflow === 'visible' || overflow === 'auto';
  }

  /**
   * The context inside an `svg` or `symbol` viewport placed at `(x, y)` with the given size:
   * the `viewBox` fitted in, and a clip to the viewport where content would overflow it.
   * `null` for an empty viewport (nothing is drawn).
   */
  private viewport(
    el: Element,
    ctx: Ctx,
    x: number,
    y: number,
    width: number,
    height: number,
    clipOverflow: boolean,
    isRoot: boolean
  ): Ctx | null {
    if (!(width > 0 && height > 0)) return null;
    const viewBox = parseViewBox(el.getAttribute('viewBox'));
    const intrinsic = isRoot
      ? {
          width: this.length(el.getAttribute('width'), 'x', ctx),
          height: this.length(el.getAttribute('height'), 'y', ctx),
        }
      : null;
    const fit = fitViewBox(
      viewBox,
      el.getAttribute('preserveAspectRatio'),
      width,
      height,
      intrinsic
    );
    const placed = tidy(multiply(ctx.matrix, translation(x, y)));
    const clips =
      clipOverflow || fit.slice
        ? [
            ...ctx.clips,
            {
              matrix: placed,
              commands: rectCommands(0, 0, width, height),
              rule: 'nonzero' as const,
            },
          ]
        : ctx.clips;
    return {
      ...ctx,
      matrix: tidy(multiply(placed, fit.matrix)),
      clips,
      viewport: viewBox ? { width: viewBox[2], height: viewBox[3] } : { width, height },
    };
  }

  private reference(el: Element): Element | null {
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
    if (!href) return null;
    if (!href.startsWith('#')) {
      this.unsupported.add('external-reference');
      return null;
    }
    return this.ids.get(href.slice(1)) ?? null;
  }

  private use(el: Element, ctx: Ctx, out: SceneOp[]): void {
    const target = this.reference(el);
    if (!target) return;
    const x = this.length(el.getAttribute('x'), 'x', ctx) ?? 0;
    const y = this.length(el.getAttribute('y'), 'y', ctx) ?? 0;
    const placed: Ctx = { ...ctx, matrix: tidy(multiply(ctx.matrix, translation(x, y))) };
    if (target.localName !== 'symbol') {
      this.element(target, placed, out);
      return;
    }
    if (this.active.has(target)) return;
    const own = this.specified(target);
    const width = this.length(el.getAttribute('width') ?? '100%', 'x', ctx);
    const height = this.length(el.getAttribute('height') ?? '100%', 'y', ctx);
    if (width === null || height === null) return;
    const inner = this.viewport(
      target,
      this.derive(own, placed),
      0,
      0,
      width,
      height,
      !this.overflows(own),
      false
    );
    if (!inner) return;
    this.active.add(target);
    try {
      this.children(target, inner, out);
    } finally {
      this.active.delete(target);
    }
  }

  // -- shapes ------------------------------------------------------------------------------

  private geometry(el: Element, name: string, ctx: Ctx): PathCommand[] {
    const len = (attribute: string, axis: 'x' | 'y' | 'xy') =>
      this.length(el.getAttribute(attribute), axis, ctx) ?? 0;
    switch (name) {
      case 'rect': {
        const [x, y, width, height] = [
          len('x', 'x'),
          len('y', 'y'),
          len('width', 'x'),
          len('height', 'y'),
        ];
        if (!(width > 0 && height > 0)) return [];
        let rx = this.length(el.getAttribute('rx'), 'x', ctx);
        let ry = this.length(el.getAttribute('ry'), 'y', ctx);
        if (rx !== null && !(rx >= 0)) rx = null;
        if (ry !== null && !(ry >= 0)) ry = null;
        rx ??= ry ?? 0;
        ry ??= rx;
        return rectCommands(x, y, width, height, Math.min(rx, width / 2), Math.min(ry, height / 2));
      }
      case 'circle': {
        const r = len('r', 'xy');
        return r > 0 ? ellipseCommands(len('cx', 'x'), len('cy', 'y'), r, r) : [];
      }
      case 'ellipse': {
        const [rx, ry] = [len('rx', 'x'), len('ry', 'y')];
        return rx > 0 && ry > 0 ? ellipseCommands(len('cx', 'x'), len('cy', 'y'), rx, ry) : [];
      }
      case 'line':
        return [
          { op: 'M', x: len('x1', 'x'), y: len('y1', 'y') },
          { op: 'L', x: len('x2', 'x'), y: len('y2', 'y') },
        ];
      case 'polyline':
      case 'polygon':
        return pointsCommands(el.getAttribute('points') ?? '', name === 'polygon');
      default:
        return parsePathData(el.getAttribute('d') ?? '');
    }
  }

  private shape(el: Element, ctx: Ctx, out: SceneOp[]): void {
    const name = el.localName;
    const commands = this.geometry(el, name, ctx);
    if (!commands.some((c) => c.op !== 'M' && c.op !== 'Z')) return;
    if (ctx.style.visibility === 'hidden' || ctx.style.visibility === 'collapse') return;
    const bounds = () => commandBounds(commands);
    const rule = ctx.style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero';

    const fill = name === 'line' ? null : this.resolvePaint('fill', ctx, bounds);
    const fillOp = fill && this.pathOp('fill', commands, rule, fill, null, ctx);
    const strokeStyle = this.strokeStyle(ctx);
    const stroke = strokeStyle && this.resolvePaint('stroke', ctx, bounds);
    const strokeOp =
      stroke && strokeStyle && this.pathOp('stroke', commands, 'nonzero', stroke, strokeStyle, ctx);
    const strokeFirst = /^\s*stroke/.test(ctx.style['paint-order'] ?? '');
    for (const op of strokeFirst ? [strokeOp, fillOp] : [fillOp, strokeOp]) if (op) out.push(op);
  }

  private pathOp(
    mode: 'fill' | 'stroke',
    commands: PathCommand[],
    rule: CanvasFillRule,
    { paint, fold }: Resolved,
    stroke: StrokeStyle | null,
    ctx: Ctx
  ): SceneOp {
    return {
      kind: 'path',
      mode,
      commands: fold ? transformCommands(commands, invert(fold)) : commands,
      rule,
      paint,
      stroke,
      matrix: fold ? tidy(multiply(ctx.matrix, fold)) : ctx.matrix,
      alpha: 1,
      clips: ctx.clips,
      shadow: null,
    };
  }

  private strokeStyle(ctx: Ctx): StrokeStyle | null {
    const width = this.length(ctx.style['stroke-width'] ?? '1', 'xy', ctx);
    if (width === null || !(width > 0)) return null;
    const { 'stroke-linecap': cap, 'stroke-linejoin': join } = ctx.style;
    const limit = Number(ctx.style['stroke-miterlimit'] ?? 4);
    return {
      width,
      cap: cap === 'round' || cap === 'square' ? cap : 'butt',
      join: join === 'round' || join === 'bevel' ? join : 'miter',
      miterLimit: limit >= 1 ? limit : 4,
      dash: this.dashes(ctx),
      dashOffset: this.length(ctx.style['stroke-dashoffset'] ?? '0', 'xy', ctx) ?? 0,
    };
  }

  /** An even-length list (an odd one repeats), or none for `none`, a bad value or a zero sum. */
  private dashes(ctx: Ctx): number[] {
    const value = ctx.style['stroke-dasharray'];
    if (!value || value === 'none') return [];
    const lengths = value
      .trim()
      .split(/[\s,]+/)
      .map((item) => this.length(item, 'xy', ctx));
    if (lengths.some((n) => n === null || n < 0)) return [];
    const dash = lengths as number[];
    if (dash.reduce((a, b) => a + b, 0) === 0) return [];
    return dash.length % 2 === 1 ? [...dash, ...dash] : dash;
  }

  // -- paint -------------------------------------------------------------------------------

  /**
   * The paint of `fill` or `stroke`, or `null` for none. `bounds` is the bounding box of the
   * shape, for gradients in box units; `null` where there is no such box (text).
   */
  private resolvePaint(
    kind: 'fill' | 'stroke',
    ctx: Ctx,
    bounds: (() => Bounds | null) | null
  ): Resolved | null {
    const raw = (ctx.style[kind] ?? (kind === 'fill' ? 'black' : 'none')).trim();
    if (raw === 'none') return null;
    const opacity = unitNumber(ctx.style[`${kind}-opacity`], 1);
    let colour = raw;
    const reference = /^url\(\s*(['"]?)(.*?)\1\s*\)\s*(.*)$/s.exec(raw);
    if (reference) {
      const target = reference[2]!.startsWith('#')
        ? this.ids.get(reference[2]!.slice(1))
        : undefined;
      if (reference[2] && !reference[2].startsWith('#')) this.unsupported.add('external-reference');
      if (target?.localName === 'linearGradient' || target?.localName === 'radialGradient') {
        return this.gradient(target, kind, opacity, ctx, bounds);
      }
      // A pattern is reported with the elements; a missing target takes the fallback colour.
      colour = target ? '' : reference[3]!;
      if (!colour) return null;
    }
    if (colour.toLowerCase() === 'currentcolor') colour = ctx.style.color ?? 'black';
    const parsed = parseSvgColor(colour);
    if (!parsed) {
      this.unsupported.add('color');
      return null;
    }
    const alpha = parsed.alpha * opacity;
    return alpha > 0 ? { paint: { type: 'solid', hex: parsed.hex, alpha }, fold: null } : null;
  }

  private gradientChain(gradient: Element): Element[] {
    const chain: Element[] = [];
    let el: Element | undefined = gradient;
    while (el && !chain.includes(el)) {
      chain.push(el);
      const href: string | null = el.getAttribute('href') ?? el.getAttribute('xlink:href');
      const next: Element | undefined = href?.startsWith('#')
        ? this.ids.get(href.slice(1))
        : undefined;
      el =
        next && (next.localName === 'linearGradient' || next.localName === 'radialGradient')
          ? next
          : undefined;
    }
    return chain;
  }

  private stops(chain: Element[], opacity: number): ColorStop[] {
    const holder = chain.find((g) => Array.from(g.children).some((c) => c.localName === 'stop'));
    const stops: ColorStop[] = [];
    let previous = 0;
    for (const stop of Array.from(holder?.children ?? [])) {
      if (stop.localName !== 'stop') continue;
      const own = this.specified(stop);
      previous = Math.max(previous, clamp01(fraction(stop.getAttribute('offset')) ?? 0));
      let colour = own.get('stop-color') ?? 'black';
      if (colour.toLowerCase() === 'currentcolor') colour = own.get('color') ?? 'black';
      const parsed = parseSvgColor(colour);
      if (!parsed) {
        this.unsupported.add('color');
        continue;
      }
      stops.push({
        offset: previous,
        hex: parsed.hex,
        alpha: parsed.alpha * unitNumber(own.get('stop-opacity'), 1) * opacity,
      });
    }
    return stops;
  }

  private gradient(
    gradient: Element,
    kind: 'fill' | 'stroke',
    opacity: number,
    ctx: Ctx,
    bounds: (() => Bounds | null) | null
  ): Resolved | null {
    const chain = this.gradientChain(gradient);
    const attribute = (name: string) =>
      chain.map((g) => g.getAttribute(name)).find((value) => value !== null) ?? null;
    const spread = attribute('spreadMethod');
    if (spread && spread !== 'pad') this.unsupported.add('spreadMethod');

    const stops = this.stops(chain, opacity);
    if (stops.length === 0) return null;
    const last = stops[stops.length - 1]!;
    const lastColour: Resolved = {
      paint: { type: 'solid', hex: last.hex, alpha: last.alpha },
      fold: null,
    };
    if (stops.length === 1) return lastColour;

    // The gradient space: the user space, or the unit square of the shape's bounding box, and
    // then the gradient's own transform.
    const boxUnits = attribute('gradientUnits') !== 'userSpaceOnUse';
    let unit = IDENTITY;
    if (boxUnits) {
      if (!bounds) {
        this.unsupported.add('textGradient');
        return null;
      }
      const box = bounds();
      if (!box || !(box.width > 0) || !(box.height > 0)) return null;
      unit = [box.width, 0, 0, box.height, box.x, box.y];
    }
    const own = attribute('gradientTransform');
    let transform = IDENTITY;
    if (own !== null) {
      const parsed = parseTransform(own);
      if (parsed) transform = parsed;
      else this.unsupported.add('transform');
    }
    const m = tidy(multiply(unit, transform));
    const [a, b, c, d] = m;
    const det = a * d - b * c;
    if (!Number.isFinite(det) || det === 0) return null;

    const coordinate = (name: string, fallback: string, axis: 'x' | 'y' | 'xy') => {
      const value = attribute(name) ?? fallback;
      return (boxUnits ? fraction(value) : this.length(value, axis, ctx)) ?? 0;
    };

    if (gradient.localName === 'linearGradient') {
      const [x1, y1] = [coordinate('x1', '0%', 'x'), coordinate('y1', '0%', 'y')];
      const [vx, vy] = [coordinate('x2', '100%', 'x') - x1, coordinate('y2', '0%', 'y') - y1];
      const length2 = vx * vx + vy * vy;
      if (length2 === 0) return lastColour;
      // Isolines are perpendicular to the vector in gradient space, not in user space: the user
      // space direction is the normal, M^-T v, scaled to the same parameter range.
      const nx = (d * vx - b * vy) / det;
      const ny = (a * vy - c * vx) / det;
      const scale = length2 / (nx * nx + ny * ny);
      const p0 = apply(m, x1, y1);
      const paint: Paint = {
        type: 'linear',
        x0: p0.x,
        y0: p0.y,
        x1: p0.x + nx * scale,
        y1: p0.y + ny * scale,
        stops,
      };
      return { paint, fold: null };
    }

    const [cx, cy] = [coordinate('cx', '50%', 'x'), coordinate('cy', '50%', 'y')];
    const r = coordinate('r', '50%', 'xy');
    if (!(r > 0)) return lastColour;
    const fx = attribute('fx') === null ? cx : coordinate('fx', '50%', 'x');
    const fy = attribute('fy') === null ? cy : coordinate('fy', '50%', 'y');
    const fr = coordinate('fr', '0%', 'xy');
    const scale = Math.hypot(a, b);
    const tolerance = 1e-9 * (a * a + b * b + c * c + d * d);
    if (
      Math.abs(a * c + b * d) <= tolerance &&
      Math.abs(a * a + b * b - c * c - d * d) <= tolerance
    ) {
      const focus = apply(m, fx, fy);
      const centre = apply(m, cx, cy);
      const paint: Paint = {
        type: 'radial',
        x0: focus.x,
        y0: focus.y,
        r0: fr * scale,
        x1: centre.x,
        y1: centre.y,
        r1: r * scale,
        stops,
      };
      return { paint, fold: null };
    }
    // An ellipse: the circle is only a circle in the gradient space, so the shape is drawn there.
    // A stroke would be distorted with it, and text has no shape to move into that space.
    if (kind === 'stroke' || bounds === null) {
      this.unsupported.add('radialGradient');
      return null;
    }
    return {
      paint: { type: 'radial', x0: fx, y0: fy, r0: fr, x1: cx, y1: cy, r1: r, stops },
      fold: m,
    };
  }

  // -- clip paths --------------------------------------------------------------------------

  /** The clip the `clip-path` property names, in the user space of the element it is on. */
  private clipPath(value: string | undefined, ctx: Ctx): ClipPath | null {
    const id = referencedId(value);
    const clip = id === null ? undefined : this.ids.get(id);
    if (!clip || clip.localName !== 'clipPath') return null;
    const own = this.specified(clip);
    if (clip.getAttribute('clipPathUnits') === 'objectBoundingBox') {
      this.unsupported.add('clipPathUnits');
      return null;
    }
    if (own.get('clip-path')) this.unsupported.add('clipPath:clip-path');
    const base = this.transform(clip);
    const commands: PathCommand[] = [];
    let rule: CanvasFillRule | null = null;
    for (const child of Array.from(clip.children)) {
      const name = child.localName;
      if (child.namespaceURI !== SVG_NS) continue;
      if (name === 'text' || name === 'use') {
        this.unsupported.add(`clipPath:${name}`);
        continue;
      }
      if (!SHAPES.has(name)) continue;
      const shape = this.specified(child);
      if (shape.get('display') === 'none' || shape.get('visibility') === 'hidden') continue;
      if (shape.get('clip-path')) this.unsupported.add('clipPath:clip-path');
      const geometry = this.geometry(child, name, this.derive(shape, ctx));
      if (geometry.length === 0) continue;
      commands.push(...transformCommands(geometry, multiply(base, this.transform(child))));
      rule ??=
        (shape.get('clip-rule') ?? own.get('clip-rule')) === 'evenodd' ? 'evenodd' : 'nonzero';
    }
    return { matrix: ctx.matrix, commands, rule: rule ?? 'nonzero' };
  }

  // -- text --------------------------------------------------------------------------------

  private fontOf(ctx: Ctx): FontSpec {
    const base = this.defaults.font;
    const [first, ...rest] = ctx.style['font-family'] ? fontFamilies(ctx.style['font-family']) : [];
    const declared = first !== undefined && !GENERIC_FAMILIES.has(first.toLowerCase());
    const fallback = declared ? rest : base.fallback;
    const style = ctx.style['font-style'];
    return {
      family: declared ? first : base.family,
      ...(fallback && fallback.length > 0 && { fallback: [...fallback] }),
      weight: ctx.fontWeight,
      style:
        style === undefined
          ? base.style
          : style === 'italic' || style === 'oblique'
            ? 'italic'
            : 'normal',
      size: ctx.fontSize,
    };
  }

  private advances(text: string, font: FontSpec): number[] {
    const measured = this.defaults.measure?.(text, font);
    const count = Array.from(text).length;
    if (measured && measured.length === count && measured.every(Number.isFinite)) return measured;
    return Array.from({ length: count }, () => font.size * GLYPH_WIDTH_EM);
  }

  private runOf(ctx: Ctx): Run {
    const font = this.fontOf(ctx);
    const hidden = ctx.style.visibility === 'hidden' || ctx.style.visibility === 'collapse';
    const fill = hidden ? null : this.resolvePaint('fill', ctx, null);
    const strokeStyle = hidden ? null : this.strokeStyle(ctx);
    const stroke = strokeStyle && this.resolvePaint('stroke', ctx, null);
    const strokeFirst = /^\s*stroke/.test(ctx.style['paint-order'] ?? '');
    const anchor = ctx.style['text-anchor'] ?? 'start';
    const baseline = ctx.style['dominant-baseline'] ?? 'auto';
    if (!Object.hasOwn(BASELINE_SHIFT, baseline)) this.unsupported.add('dominant-baseline');
    const shift = (BASELINE_SHIFT[baseline] ?? 0) * font.size;
    const key = JSON.stringify([font, fill, stroke, strokeStyle, strokeFirst, anchor, shift]);
    return {
      key,
      font,
      fill,
      stroke,
      strokeStyle: stroke ? strokeStyle : null,
      strokeFirst,
      anchor,
      shift,
    };
  }

  /** Properties and attributes of text that the ops cannot say. */
  private flagText(el: Element, ctx: Ctx): void {
    for (const attribute of ['rotate', 'textLength']) {
      if (el.hasAttribute(attribute)) this.unsupported.add(attribute);
    }
    // White space is always collapsed here; a text that keeps its spaces would move.
    if (
      el.getAttribute('xml:space') === 'preserve' ||
      /^pre/.test(ctx.style['white-space'] ?? '')
    ) {
      this.unsupported.add('xml:space');
    }
    for (const property of ['letter-spacing', 'word-spacing']) {
      const value = ctx.style[property];
      if (value && value !== 'normal' && parseFloat(value) !== 0) this.unsupported.add(property);
    }
    const decoration = ctx.style['text-decoration'];
    if (decoration && decoration !== 'none') this.unsupported.add('text-decoration');
    const mode = ctx.style['writing-mode'];
    if (mode && !['horizontal-tb', 'lr', 'lr-tb'].includes(mode))
      this.unsupported.add('writing-mode');
  }

  private text(root: Element, ctx: Ctx, out: SceneOp[]): void {
    const glyphs: Glyph[] = [];
    // Positions by the index of the glyph they apply to: `x`, `y`, `dx` and `dy` are lists.
    const at = {
      x: new Map<number, number>(),
      y: new Map<number, number>(),
      dx: new Map<number, number>(),
      dy: new Map<number, number>(),
    };
    let penX = 0;
    let penY = 0;
    let chunk = -1;
    let afterSpace = true;

    const positions = (el: Element, style: Ctx) => {
      for (const [name, axis] of [
        ['x', 'x'],
        ['y', 'y'],
        ['dx', 'x'],
        ['dy', 'y'],
      ] as const) {
        const list =
          el
            .getAttribute(name)
            ?.trim()
            .split(/[\s,]+/)
            .filter(Boolean) ?? [];
        list.forEach((item, i) => {
          const value = this.length(item, axis, style);
          if (value !== null) at[name].set(glyphs.length + i, value);
        });
      }
      this.flagText(el, style);
    };

    const addText = (data: string, style: Ctx) => {
      const run = this.runOf(style);
      const kept: string[] = [];
      for (const char of Array.from(data.replace(/[\t\r\n ]+/g, ' '))) {
        if (char === ' ' && afterSpace) continue;
        afterSpace = char === ' ';
        kept.push(char);
      }
      if (kept.length === 0) return;
      const advances = this.advances(kept.join(''), run.font);
      kept.forEach((char, i) => {
        const index = glyphs.length;
        let starts = index === 0;
        if (at.x.has(index)) {
          penX = at.x.get(index)!;
          starts = true;
        }
        if (at.y.has(index)) {
          penY = at.y.get(index)!;
          starts = true;
        }
        penX += at.dx.get(index) ?? 0;
        penY += at.dy.get(index) ?? 0;
        if (starts) chunk++;
        glyphs.push({ char, x: penX, y: penY, advance: advances[i]!, run, chunk });
        penX += advances[i]!;
      });
    };

    const visit = (el: Element, style: Ctx) => {
      positions(el, style);
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3 || node.nodeType === 4) {
          addText((node as CharacterData).data, style);
        } else if (node.nodeType === 1) {
          const child = node as Element;
          if (
            child.namespaceURI !== SVG_NS ||
            (child.localName !== 'tspan' && child.localName !== 'a')
          )
            continue;
          const own = this.specified(child);
          if (own.get('display') !== 'none') visit(child, this.derive(own, style));
        }
      }
    };
    visit(root, ctx);
    while (glyphs.at(-1)?.char === ' ') glyphs.pop();

    // A text chunk (it starts at an absolute position) is anchored as a whole.
    const chunks = new Map<number, Glyph[]>();
    for (const glyph of glyphs)
      chunks.set(glyph.chunk, [...(chunks.get(glyph.chunk) ?? []), glyph]);
    const shifts = new Map<number, number>();
    for (const [index, members] of chunks) {
      const [first, last] = [members[0]!, members[members.length - 1]!];
      const width = last.x + last.advance - first.x;
      shifts.set(
        index,
        first.run.anchor === 'middle' ? -width / 2 : first.run.anchor === 'end' ? -width : 0
      );
    }

    let group: Glyph[] = [];
    const flush = () => {
      const first = group[0];
      if (!first) return;
      const { run } = first;
      const make = (mode: 'fill' | 'stroke'): SceneOp | null => {
        const resolved = mode === 'fill' ? run.fill : run.stroke;
        if (!resolved) return null;
        return {
          kind: 'text',
          mode,
          text: group.map((g) => g.char).join(''),
          xs: group.map((g) => g.x + (shifts.get(g.chunk) ?? 0)),
          y: first.y + run.shift,
          font: run.font,
          paint: resolved.paint,
          stroke: mode === 'stroke' ? run.strokeStyle : null,
          matrix: ctx.matrix,
          alpha: 1,
          clips: ctx.clips,
          shadow: null,
        };
      };
      const ops = run.strokeFirst ? [make('stroke'), make('fill')] : [make('fill'), make('stroke')];
      for (const op of ops) if (op) out.push(op);
      group = [];
    };
    for (const glyph of glyphs) {
      const previous = group.at(-1);
      if (previous && (previous.run.key !== glyph.run.key || previous.y !== glyph.y)) flush();
      group.push(glyph);
    }
    flush();
  }
}

/**
 * Element opacity: on the one op it makes, its alpha; on several, a group composited as a whole.
 */
function withOpacity(ops: SceneOp[], opacity: number): SceneOp[] {
  if (opacity >= 1 || ops.length === 0) return ops;
  if (ops.length === 1) return [{ ...ops[0]!, alpha: ops[0]!.alpha * opacity }];
  return [{ kind: 'group', matrix: IDENTITY, alpha: opacity, clips: [], shadow: null, ops }];
}
