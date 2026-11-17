// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Writes a resolved export scene (`ExportScene`) as one SVG document that opens as layers in
 * Illustrator, Inkscape and Affinity.
 *
 * - One `<g id="el-…" data-element-id="…">` per item, with the layer label as its `<title>`.
 * - Every op keeps the matrix it was drawn with, as the `transform` of its element; the clip stack
 *   becomes nested `<g clip-path>` around the ops that share it, in page px. A clip that clips
 *   everything away drops the op.
 * - Gradients, patterns, clip paths and shadow filters are written once into `<defs>`.
 * - Text is glyph outlines, one `<path>` per run of code points a font file covers, placed at the
 *   x the browser measured. A run no file covers, and all text in `editable` mode, is a `<text>`
 *   with the font family: fonts are never embedded.
 * - An SVG source is inlined as a nested `<svg>` with its ids, classes and style rules scoped to
 *   the instance (`inlineSvg.ts`); one whose CSS cannot be scoped, and any other image, is a data
 *   URL. In outline mode a source with text of its own (a chart) is not inlined: its shapes and
 *   text are written as scene ops (`svgImageScene.ts`), so its text is outlined like the page's
 *   and the `@font-face` it carries stays out of the file. A source the converter cannot read
 *   completely is inlined after all, and `report.unknownCalls` says its text was not outlined.
 *
 * Numbers have three decimals. The linear part of a matrix has six: a rotation that is off by
 * 0.0005 in its cosine moves a point 1000 px from the origin by half a pixel. The output depends
 * on nothing but the scene and the options: same input, same bytes.
 */
import type { FontFileSet } from '../fonts/fontFiles.js';
import { fakeBoldWidth, glyphOutline, splitRuns } from '../fonts/glyphs.js';
import { inlineSvg } from './inlineSvg.js';
import {
  mostUsedFont,
  svgDefaultsFor,
  svgHasText,
  svgImageGroup,
  type SvgSource,
} from './svgImageScene.js';
import type { SvgToSceneDefaults } from './svgToScene.js';
import { escapeXml, formatNumber, withoutIllegalXml } from './xml.js';

import type {
  ClipPath,
  ExportReport,
  ExportScene,
  FontSpec,
  Matrix,
  Paint,
  PathCommand,
  SceneImageSource,
  SceneItem,
  SceneOp,
  Shadow,
  StrokeStyle,
} from '../scene/types.js';

export interface WriteSvgOptions {
  text: 'outlines' | 'editable';
  /** Resolved per FontSpec key `${family}|${weight}|${style}`; absent → <text>. */
  fonts: ReadonlyMap<string, FontFileSet>;
  report: ExportReport;
  page: number;
}

export function writeSvg(scene: ExportScene, options: WriteSvgOptions): string {
  return new SvgWriter(scene, options).write();
}

// ---------------------------------------------------------------------------------------------
// Markup

/** An undefined value leaves the attribute out. */
type Attrs = Record<string, string | undefined>;

type PathOp = Extract<SceneOp, { kind: 'path' }>;
type TextOp = Extract<SceneOp, { kind: 'text' }>;
type ImageOp = Extract<SceneOp, { kind: 'image' }>;
type PatternPaint = Extract<Paint, { type: 'pattern' }>;
type GradientPaint = Extract<Paint, { type: 'linear' | 'radial' }>;

const num = (value: number) => formatNumber(value);

function attributeText(attrs: Attrs): string {
  let text = '';
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined) text += ` ${name}="${escapeXml(value)}"`;
  }
  return text;
}

/**
 * An element as lines, children indented. `children` is a string for inline content (already
 * escaped markup) and lines for nested elements; nothing at all makes it self-closing.
 */
function el(name: string, attrs: Attrs, children?: string[] | string): string[] {
  const open = `<${name}${attributeText(attrs)}`;
  if (children === undefined || (Array.isArray(children) && children.length === 0)) {
    return [`${open}/>`];
  }
  if (typeof children === 'string') return [`${open}>${children}</${name}>`];
  return [`${open}>`, ...children.map((line) => `  ${line}`), `</${name}>`];
}

/** `el('g', …)` unless there is nothing to say about the group. */
function wrap(attrs: Attrs, lines: string[]): string[] {
  return Object.values(attrs).some((value) => value !== undefined) ? el('g', attrs, lines) : lines;
}

/** Nothing for the identity, `translate` for a move, `matrix` otherwise. */
function transformOf(matrix: Matrix): string | undefined {
  const [a, b, c, d] = [matrix[0], matrix[1], matrix[2], matrix[3]].map((v) => formatNumber(v, 6));
  const [e, f] = [num(matrix[4]), num(matrix[5])];
  if (a === '1' && b === '0' && c === '0' && d === '1') {
    return e === '0' && f === '0' ? undefined : `translate(${e},${f})`;
  }
  return `matrix(${a},${b},${c},${d},${e},${f})`;
}

/** Compact path data: the command letter, then its numbers; `dx`/`dy` move every point. */
function pathData(commands: readonly PathCommand[], dx = 0, dy = 0): string {
  let d = '';
  for (const c of commands) {
    switch (c.op) {
      case 'M':
      case 'L':
        d += `${c.op}${num(c.x + dx)} ${num(c.y + dy)}`;
        break;
      case 'C':
        d += `C${num(c.x1 + dx)} ${num(c.y1 + dy)} ${num(c.x2 + dx)} ${num(c.y2 + dy)} ${num(c.x + dx)} ${num(c.y + dy)}`;
        break;
      case 'Q':
        d += `Q${num(c.x1 + dx)} ${num(c.y1 + dy)} ${num(c.x + dx)} ${num(c.y + dy)}`;
        break;
      case 'Z':
        d += 'Z';
        break;
    }
  }
  return d;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function dataUrl(image: SceneImageSource): string {
  return image.kind === 'svg'
    ? `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(image.markup))}`
    : `data:${image.mime};base64,${toBase64(image.bytes)}`;
}

const CSS_WORD = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

/** A family list as CSS: a name of plain words as it is, any other name quoted. */
function fontFamily(font: FontSpec): string {
  return [font.family, ...(font.fallback ?? [])]
    .map((name) => {
      const words = name.trim().split(/\s+/);
      return words.every((word) => CSS_WORD.test(word))
        ? words.join(' ')
        : `'${name.replace(/(['\\])/g, '\\$1')}'`;
    })
    .join(', ');
}

const PLAIN_STROKE: StrokeStyle = {
  width: 1,
  cap: 'butt',
  join: 'miter',
  miterLimit: 10,
  dash: [],
  dashOffset: 0,
};

/** SVG's defaults differ from the canvas's only in the miter limit (4 against 10): both are explicit. */
function strokeAttrs(stroke: StrokeStyle | null): Attrs {
  const s = stroke ?? PLAIN_STROKE;
  return {
    'stroke-width': num(s.width),
    'stroke-linecap': s.cap === 'butt' ? undefined : s.cap,
    'stroke-linejoin': s.join === 'miter' ? undefined : s.join,
    'stroke-miterlimit': s.join === 'miter' && s.miterLimit !== 4 ? num(s.miterLimit) : undefined,
    'stroke-dasharray': s.dash.length > 0 ? s.dash.map(num).join(' ') : undefined,
    'stroke-dashoffset': s.dashOffset !== 0 ? num(s.dashOffset) : undefined,
  };
}

function viewBoxOf(value: string | undefined): [number, number, number, number] | null {
  const parts =
    value
      ?.trim()
      .split(/[\s,]+/)
      .map(Number) ?? [];
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isFinite(p)) ||
    parts[2]! <= 0 ||
    parts[3]! <= 0
  ) {
    return null;
  }
  return parts as [number, number, number, number];
}

/**
 * Attributes of an inlined root that the writer sets itself, or that mean nothing nested. `style`
 * is one of them: a chart's `width: 100%; height: 100%` sizes it in CSS terms where it stands
 * alone, and nested it would fight the `width` and `height` the writer places it with (Firefox
 * and Illustrator read it).
 */
const OWN_ROOT_ATTRS = new Set([
  'style',
  'x',
  'y',
  'width',
  'height',
  'viewBox',
  'preserveAspectRatio',
  'version',
  'baseProfile',
  'zoomAndPan',
]);

// ---------------------------------------------------------------------------------------------

class SvgWriter {
  /** The lines of `<defs>`, in the order of first use. */
  private readonly defs: string[] = [];
  private readonly defIds = new Map<string, string>();
  private readonly clipIds = new Map<ClipPath, string>();
  private readonly tileIds = new Map<SceneImageSource, number>();
  private readonly counters = new Map<string, number>();
  private readonly usedIds = new Set<string>();
  private inlined = 0;
  private elementId: string | null = null;
  private svgTextDefaults: SvgToSceneDefaults | null = null;

  constructor(
    private readonly scene: ExportScene,
    private readonly options: WriteSvgOptions
  ) {}

  write(): string {
    const body = this.scene.items.flatMap((item) => this.item(item));
    const { width, height } = this.scene;
    const root = el(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        'xmlns:xlink': 'http://www.w3.org/1999/xlink',
        viewBox: `0 0 ${num(width)} ${num(height)}`,
        width: num(width),
        height: num(height),
      },
      [...(this.defs.length > 0 ? el('defs', {}, this.defs) : []), ...body]
    );
    return `${root.join('\n')}\n`;
  }

  // -- structure ---------------------------------------------------------------------------

  private item(item: SceneItem): string[] {
    this.elementId = item.elementId;
    const base = `el-${(item.elementId ?? 'page').replace(/[^A-Za-z0-9_-]/g, '_')}`;
    let id = base;
    for (let n = 2; this.usedIds.has(id); n++) id = `${base}-${n}`;
    this.usedIds.add(id);
    const title = item.label ? el('title', {}, escapeXml(item.label)) : [];
    return el('g', { id, 'data-element-id': item.elementId ?? undefined }, [
      ...title,
      ...this.ops(item.ops),
    ]);
  }

  /**
   * The ops in order. Neighbours whose clip stacks begin with the same clips (by reference) sit
   * in the same `<g clip-path>`, one level per clip.
   */
  private ops(ops: readonly SceneOp[]): string[] {
    const out: string[] = [];
    const open: { clip: ClipPath; id: string; lines: string[] }[] = [];
    const sink = () => open.at(-1)?.lines ?? out;
    const closeTo = (depth: number) => {
      while (open.length > depth) {
        const frame = open.pop()!;
        sink().push(...el('g', { 'clip-path': `url(#${frame.id})` }, frame.lines));
      }
    };
    for (const op of ops) {
      if (op.clips.some((clip) => clip.commands.length === 0)) continue;
      const lines = this.op(op);
      if (lines.length === 0) continue;
      let shared = 0;
      while (
        shared < open.length &&
        shared < op.clips.length &&
        open[shared]!.clip === op.clips[shared]
      ) {
        shared++;
      }
      closeTo(shared);
      for (const clip of op.clips.slice(shared)) {
        open.push({ clip, id: this.clipId(clip), lines: [] });
      }
      sink().push(...lines);
    }
    closeTo(0);
    return out;
  }

  /** The op, and its shadow filter around it: the filter works in page px, outside the matrix. */
  private op(op: SceneOp): string[] {
    const lines = this.content(op);
    if (lines.length === 0 || !op.shadow) return lines;
    return el('g', { filter: `url(#${this.shadowId(op.shadow)})` }, lines);
  }

  private content(op: SceneOp): string[] {
    const common: Attrs = {
      transform: transformOf(op.matrix),
      opacity: op.alpha < 1 ? num(op.alpha) : undefined,
    };
    switch (op.kind) {
      case 'path':
        return this.path(op, common);
      case 'text':
        return this.text(op, common);
      case 'image':
        return this.image(op, common);
      case 'group': {
        const children = this.ops(op.ops);
        return children.length > 0 ? wrap(common, children) : [];
      }
      case 'raster':
        if (op.png) {
          return el('image', {
            x: num(op.x),
            y: num(op.y),
            width: num(op.width),
            height: num(op.height),
            preserveAspectRatio: 'none',
            'xlink:href': `data:image/png;base64,${toBase64(op.png)}`,
            ...common,
          });
        }
        // Without pixels, the ops the island was made of; each carries its own state.
        return op.source ? this.ops(op.source) : [];
    }
  }

  // -- shapes and text ---------------------------------------------------------------------

  private path(op: PathOp, common: Attrs): string[] {
    if (op.commands.length === 0) return [];
    const paint = this.shapePaint(op.mode, op.paint, op.stroke, op.rule);
    return paint ? el('path', { d: pathData(op.commands), ...paint, ...common }) : [];
  }

  private shapePaint(
    mode: 'fill' | 'stroke',
    paint: Paint,
    stroke: StrokeStyle | null,
    rule: CanvasFillRule
  ): Attrs | null {
    const painted = this.paint(mode, paint);
    if (!painted) return null;
    return mode === 'fill'
      ? { ...painted, 'fill-rule': rule === 'evenodd' ? 'evenodd' : undefined }
      : { fill: 'none', ...painted, ...strokeAttrs(stroke) };
  }

  private paint(kind: 'fill' | 'stroke', paint: Paint): Attrs | null {
    switch (paint.type) {
      case 'solid':
        return {
          [kind]: paint.hex,
          [`${kind}-opacity`]: paint.alpha < 1 ? num(paint.alpha) : undefined,
        };
      case 'linear':
      case 'radial':
        return { [kind]: `url(#${this.gradientId(paint)})` };
      case 'pattern': {
        const id = this.patternId(paint);
        return id ? { [kind]: `url(#${id})` } : null;
      }
    }
  }

  private text(op: TextOp, common: Attrs): string[] {
    const paint = this.shapePaint(op.mode, op.paint, op.stroke, 'nonzero');
    if (!paint) return [];
    const whole = { text: op.text, xs: op.xs };
    if (this.options.text === 'editable') return this.textElement(op, whole, paint, common);

    const set = this.options.fonts.get(`${op.font.family}|${op.font.weight}|${op.font.style}`);
    const runs = set
      ? splitRuns(set, op.text, op.xs)
      : op.text === ''
        ? []
        : [{ file: null, ...whole }];
    const parts: ((extra: Attrs) => string[])[] = [];
    for (const run of runs) {
      if (run.file === null) {
        this.options.report.missingGlyphs.push({
          page: this.options.page,
          elementId: this.elementId,
          text: run.text,
        });
        parts.push((extra) => this.textElement(op, run, paint, extra));
        continue;
      }
      const { defaultInstanceFonts } = this.options.report;
      if (run.file.variation === 'default-only' && !defaultInstanceFonts.includes(op.font.family)) {
        defaultInstanceFonts.push(op.font.family);
      }
      const glyphs = glyphOutline(run.file, run.text, op.font.size);
      const d = glyphs.map((glyph, i) => pathData(glyph.path, run.xs[i] ?? 0, op.y)).join('');
      // A regular cut standing in for a bold: the outline grows by a stroke in the fill's colour.
      // Fill and stroke are painted opaque and the alpha sits on a group around them, or the
      // inner half of the stroke band would be painted twice and come out darker than on canvas.
      const grows = run.file.fakeBold && op.mode === 'fill' && paint['fill'] !== undefined;
      if (d === '') continue;
      if (!grows) {
        parts.push((extra) => el('path', { d, ...paint, ...extra }));
        continue;
      }
      const { 'fill-opacity': alpha, ...opaque } = paint;
      const grown = {
        d,
        ...opaque,
        stroke: paint['fill'],
        'stroke-width': num(fakeBoldWidth(op.font.size)),
        'stroke-linejoin': 'round',
      };
      parts.push((extra) =>
        alpha === undefined
          ? el('path', { ...grown, ...extra })
          : el('g', { opacity: alpha }, el('path', { ...grown, ...extra }))
      );
    }
    if (parts.length === 0) return [];
    if (parts.length === 1) return parts[0]!(common);
    return wrap(
      common,
      parts.flatMap((part) => part({}))
    );
  }

  /**
   * A `<text>` with one x per code point; `xml:space` keeps the spaces the x list counts. A code
   * point XML forbids is left out of the text and of the list alike.
   */
  private textElement(
    op: TextOp,
    whole: { text: string; xs: number[] },
    paint: Attrs,
    extra: Attrs
  ): string[] {
    const run = withoutIllegalXml(whole);
    if (run.text === '') return [];
    return el(
      'text',
      {
        x: run.xs.map(num).join(' '),
        y: num(op.y),
        'font-family': fontFamily(op.font),
        'font-size': num(op.font.size),
        'font-weight': String(op.font.weight),
        'font-style': op.font.style,
        'xml:space': 'preserve',
        ...paint,
        ...extra,
      },
      escapeXml(run.text)
    );
  }

  // -- images ------------------------------------------------------------------------------

  private image(op: ImageOp, common: Attrs): string[] {
    const image = op.image;
    if (image.kind === 'element') return []; // not resolved: nothing to embed
    if (op.sw === 0 || op.sh === 0 || op.dw === 0 || op.dh === 0) return [];
    if (image.kind === 'svg') {
      const outlined =
        this.options.text === 'outlines' && svgHasText(image.markup)
          ? this.outlinedSvg(op, image)
          : null;
      if (outlined) return outlined;
      const inlined = inlineSvg(image.markup, `i${this.inlined}-`);
      if (inlined) {
        this.inlined++;
        return this.nestedSvg(op, image, inlined, common);
      }
    }
    return this.embeddedImage(op, image, common);
  }

  /**
   * The picture's shapes and text as ops, written like any others, or null when the converter
   * cannot read all of it: the picture is then inlined as it is, with live text, and the report
   * says which constructs stopped it. The op's matrix, clips and shadow are the caller's; the
   * ops carry the matrix themselves, and the group the op's alpha and the crop.
   */
  private outlinedSvg(op: ImageOp, source: SvgSource): string[] | null {
    this.svgTextDefaults ??= svgDefaultsFor(this.options.fonts, mostUsedFont([this.scene]));
    const { group, unsupported } = svgImageGroup(op, source, this.svgTextDefaults, []);
    if (unsupported.length > 0) {
      this.options.report.unknownCalls.push({
        page: this.options.page,
        elementId: this.elementId,
        call: `svg text not outlined: ${unsupported.join(', ')}`,
      });
      return null;
    }
    return this.ops([group]);
  }

  /** The picture as an `<image>`; a source rect smaller than the picture is a clip on a larger one. */
  private embeddedImage(op: ImageOp, image: SceneImageSource, common: Attrs): string[] {
    const whole =
      num(op.sx) === '0' &&
      num(op.sy) === '0' &&
      num(op.sw) === num(image.width) &&
      num(op.sh) === num(image.height);
    const kx = op.dw / op.sw;
    const ky = op.dh / op.sh;
    const box = whole
      ? [op.dx, op.dy, op.dw, op.dh]
      : [op.dx - op.sx * kx, op.dy - op.sy * ky, image.width * kx, image.height * ky];
    return el('image', {
      x: num(box[0]!),
      y: num(box[1]!),
      width: num(box[2]!),
      height: num(box[3]!),
      preserveAspectRatio: 'none',
      'xlink:href': dataUrl(image),
      'clip-path': whole ? undefined : `url(#${this.rectClipId(op.dx, op.dy, op.dw, op.dh)})`,
      ...common,
    });
  }

  /**
   * The SVG as a nested `<svg>` over the destination rect. The matrix goes on a group around it:
   * SVG 1.1 has no `transform` on `<svg>`, and the tools that read 1.1 ignore it.
   *
   * The canvas draws the image at its natural size (`image.width` × `image.height`) and then
   * crops and stretches that bitmap. When the viewBox has the shape of the natural size the two
   * steps are one move of the viewBox; when it does not (and the root does not say `none`) the
   * SVG is first fitted into its natural size by an inner viewport, then the outer one crops.
   */
  private nestedSvg(
    op: ImageOp,
    image: Extract<SceneImageSource, { kind: 'svg' }>,
    inlined: { attrs: Record<string, string>; inner: string },
    common: Attrs
  ): string[] {
    const { attrs, inner } = inlined;
    const passed: Attrs = {};
    for (const [name, value] of Object.entries(attrs)) {
      if (!OWN_ROOT_ATTRS.has(name)) passed[name] = value;
    }
    const viewBox = viewBoxOf(attrs.viewBox) ?? [0, 0, image.width, image.height];
    const stretches = /^\s*(defer\s+)?none\b/.test(attrs.preserveAspectRatio ?? '');
    const sameShape =
      Math.abs(viewBox[2] * image.height - viewBox[3] * image.width) <=
      1e-3 * viewBox[3] * image.width;
    const place = { x: num(op.dx), y: num(op.dy), width: num(op.dw), height: num(op.dh) };

    if (sameShape || stretches) {
      const kx = viewBox[2] / image.width;
      const ky = viewBox[3] / image.height;
      const cropped = [viewBox[0] + op.sx * kx, viewBox[1] + op.sy * ky, op.sw * kx, op.sh * ky];
      return wrap(
        common,
        el(
          'svg',
          { ...place, viewBox: cropped.map(num).join(' '), preserveAspectRatio: 'none', ...passed },
          inner
        )
      );
    }
    const fitted = el(
      'svg',
      {
        x: '0',
        y: '0',
        width: num(image.width),
        height: num(image.height),
        viewBox: attrs.viewBox,
        preserveAspectRatio: attrs.preserveAspectRatio,
        ...passed,
      },
      inner
    );
    return wrap(
      common,
      el(
        'svg',
        {
          ...place,
          viewBox: [op.sx, op.sy, op.sw, op.sh].map(num).join(' '),
          preserveAspectRatio: 'none',
        },
        fitted
      )
    );
  }

  // -- definitions -------------------------------------------------------------------------

  private newId(kind: string): string {
    const n = this.counters.get(kind) ?? 0;
    this.counters.set(kind, n + 1);
    return `${kind}-${n}`;
  }

  /** One definition per `key`: the id of the first, or a new one built by `build`. */
  private define(kind: string, key: string, build: (id: string) => string[]): string {
    const known = this.defIds.get(`${kind}\0${key}`);
    if (known) return known;
    const id = this.newId(kind);
    this.defIds.set(`${kind}\0${key}`, id);
    this.defs.push(...build(id));
    return id;
  }

  private gradientId(paint: GradientPaint): string {
    return this.define('grad', JSON.stringify(paint), (id) => {
      const stops = paint.stops.flatMap((stop) =>
        el('stop', {
          offset: num(stop.offset),
          'stop-color': stop.hex,
          'stop-opacity': stop.alpha < 1 ? num(stop.alpha) : undefined,
        })
      );
      // The canvas's two circles: the start one is SVG's focal circle, the end one the gradient's.
      return paint.type === 'linear'
        ? el(
            'linearGradient',
            {
              id,
              gradientUnits: 'userSpaceOnUse',
              x1: num(paint.x0),
              y1: num(paint.y0),
              x2: num(paint.x1),
              y2: num(paint.y1),
            },
            stops
          )
        : el(
            'radialGradient',
            {
              id,
              gradientUnits: 'userSpaceOnUse',
              cx: num(paint.x1),
              cy: num(paint.y1),
              r: num(paint.r1),
              fx: num(paint.x0),
              fy: num(paint.y0),
              fr: paint.r0 !== 0 ? num(paint.r0) : undefined,
            },
            stops
          );
    });
  }

  /** One pattern per tile (by identity) and pattern matrix; null for a tile that was never resolved. */
  private patternId(paint: PatternPaint): string | null {
    const tile = paint.image;
    if (tile.kind === 'element') return null;
    let tileId = this.tileIds.get(tile);
    if (tileId === undefined) {
      tileId = this.tileIds.size;
      this.tileIds.set(tile, tileId);
    }
    return this.define('pattern', `${tileId}\0${paint.matrix.join(',')}`, (id) =>
      el(
        'pattern',
        {
          id,
          patternUnits: 'userSpaceOnUse',
          width: num(tile.width),
          height: num(tile.height),
          patternTransform: transformOf(paint.matrix),
        },
        el('image', {
          width: num(tile.width),
          height: num(tile.height),
          preserveAspectRatio: 'none',
          'xlink:href': dataUrl(tile),
        })
      )
    );
  }

  private clipId(clip: ClipPath): string {
    let id = this.clipIds.get(clip);
    if (id === undefined) {
      id = this.newId('clip');
      this.clipIds.set(clip, id);
      this.defs.push(
        ...el(
          'clipPath',
          { id },
          el('path', {
            d: pathData(clip.commands),
            transform: transformOf(clip.matrix),
            'clip-rule': clip.rule === 'evenodd' ? 'evenodd' : undefined,
          })
        )
      );
    }
    return id;
  }

  private rectClipId(x: number, y: number, width: number, height: number): string {
    const rect = { x: num(x), y: num(y), width: num(width), height: num(height) };
    return this.define('clip', `rect\0${Object.values(rect).join(',')}`, (id) =>
      el('clipPath', { id }, el('rect', rect))
    );
  }

  /**
   * A canvas shadow is a Gaussian of sigma blur / 2, moved by the offsets, in page px. The
   * region is the page plus the reach of the shadow, in user space: a percentage of the shape's
   * box would be empty for a hairline and too small for a small shape with a long shadow.
   */
  private shadowId(shadow: Shadow): string {
    return this.define('shadow', JSON.stringify(shadow), (id) => {
      const sigma = shadow.blur / 2;
      const reach = Math.ceil(Math.hypot(shadow.offsetX, shadow.offsetY) + 3 * sigma);
      return el(
        'filter',
        {
          id,
          filterUnits: 'userSpaceOnUse',
          x: num(-reach),
          y: num(-reach),
          width: num(this.scene.width + 2 * reach),
          height: num(this.scene.height + 2 * reach),
          'color-interpolation-filters': 'sRGB',
        },
        [
          ...el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: num(sigma), result: 'blur' }),
          ...el('feOffset', {
            in: 'blur',
            dx: num(shadow.offsetX),
            dy: num(shadow.offsetY),
            result: 'offset',
          }),
          ...el('feFlood', {
            'flood-color': shadow.hex,
            'flood-opacity': num(shadow.alpha),
            result: 'flood',
          }),
          ...el('feComposite', { in: 'flood', in2: 'offset', operator: 'in', result: 'shadow' }),
          ...el('feMerge', {}, [
            ...el('feMergeNode', { in: 'shadow' }),
            ...el('feMergeNode', { in: 'SourceGraphic' }),
          ]),
        ]
      );
    });
  }
}
