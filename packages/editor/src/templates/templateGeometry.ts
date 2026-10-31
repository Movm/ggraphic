// SPDX-License-Identifier: MPL-2.0
/**
 * How each element kind's numbers move when a template is placed on a page of
 * another size (axes: x, y, w, h, font size `s`, icon scale `k`). Every top-level
 * number of a kind is either here or in `UNSCALED_FIELDS` with the reason it stays;
 * `templateGeometry.vitest.ts` builds each kind by its factory and goes red on a
 * number (or number array) that is in neither; the guard runs over the factory default
 * and a populated fixture that sets every optional number. Keyed by `stateKey`, as `BINDABLE_FIELDS` is.
 */
import {
  aliasFontFamily,
  minTextSizePx,
  parseColor,
  toHex,
  type GateAdapter,
  type GeometryTable,
} from '@ggraphic/core';
import {
  fitFontSizeToSlot,
  layoutRichTextBlock,
  PLAIN_STYLE,
  slotFits,
  type MeasureRun,
  type SlotFit,
} from '@ggraphic/schema';

import { GRAIN_SPECK_ALPHA } from '../utils/grainSpec.js';
import { plainTextLines } from '../utils/plainTextLayout.js';
import { usesRichText } from '../utils/textRouting.js';
import { createRunMeasurer, type MeasureWidth, type TextAccent } from '../utils/textUtils.js';
import { FONT_WIDTHS } from './fontWidths.generated.js';
import { getAllIllustrations } from '../utils/illustrations/registry.js';
import type { IllustrationDef } from '../utils/illustrations/types.js';

import { BINDABLE_FIELDS } from '../brand/bindableFields.js';
import { catalogIconId, type IconIdCarrier } from '../utils/iconInstances.js';

export const TEMPLATE_GEOMETRY: GeometryTable = {
  additionalTexts: {
    x: 'x',
    y: 'y',
    width: 'w',
    fontSize: 's',
    // The prototype's size, the ceiling of the fit: scaled like `fontSize`.
    maxFontSize: 's',
    strokeWidth: 's',
    shadowBlur: 's',
    shadowOffsetX: 's',
    shadowOffsetY: 's',
  },
  shapeInstances: {
    x: 'x',
    y: 'y',
    width: 'w',
    height: 'h',
    cornerRadius: 's',
    textGrowth: 's',
    strokeWidth: 's',
    // A number array: every element is a px length and scales like `s`.
    dash: 's',
    shadowBlur: 's',
    shadowOffsetX: 's',
    shadowOffsetY: 's',
  },
  userImageInstances: {
    x: 'x',
    y: 'y',
    width: 'w',
    height: 'h',
    blur: 's',
    shadowBlur: 's',
    shadowOffsetX: 's',
    shadowOffsetY: 's',
  },
  chartInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
  iconStates: { x: 'x', y: 'y', scale: 'k' },
  frameInstances: {
    x: 'x',
    y: 'y',
    width: 'w',
    height: 'h',
    borderWidth: 's',
    cornerRadius: 's',
    // Px inside the frame (`coverPhotoRect` adds them to the centred photo's position).
    imageOffsetX: 's',
    imageOffsetY: 's',
    // A number array: every element is a px length and scales like `s`.
    borderDash: 's',
    shadowBlur: 's',
    shadowOffsetX: 's',
    shadowOffsetY: 's',
  },
  illustrationInstances: { x: 'x', y: 'y', scale: 'k' },
  circleBadgeInstances: { x: 'x', y: 'y', radius: 's' },
  pillBadgeInstances: {
    x: 'x',
    y: 'y',
    fontSize: 's',
    paddingX: 's',
    paddingY: 's',
    cornerRadius: 's',
  },
  page: {},
};

/** stateKey → numeric field → why it stays as it is. */
const RATIO = 'ratio; independent of the page size';
const ANGLE = 'angle; independent of the page size';
const OPACITY = 'opacity; independent of the page size';
const SHADOW_OPACITY = 'opacity; independent of the page size';
const EM = 'em, relative to the font size; independent of the page size';
const CANVAS_SHARE = 'a share of the canvas width; independent of the page size';
const ADJUSTMENT = 'image adjustment (a filter strength or a share); independent of the page size';

export const UNSCALED_FIELDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  iconStates: { rotation: ANGLE, opacity: OPACITY },
  additionalTexts: {
    rotation: ANGLE,
    scale: RATIO,
    opacity: OPACITY,
    lineHeight: RATIO,
    letterSpacing: EM,
    shadowOpacity: SHADOW_OPACITY,
  },
  shapeInstances: {
    rotation: ANGLE,
    scaleX: RATIO,
    scaleY: RATIO,
    opacity: OPACITY,
    shadowOpacity: SHADOW_OPACITY,
    notch: CANVAS_SHARE,
    grain: OPACITY,
    patternSpacing: CANVAS_SHARE,
  },
  frameInstances: {
    rotation: ANGLE,
    scaleX: RATIO,
    scaleY: RATIO,
    opacity: OPACITY,
    imageScale: RATIO,
    tilt: ANGLE,
    aspectRatioLock: RATIO,
  },
  illustrationInstances: { rotation: ANGLE, opacity: OPACITY },
  circleBadgeInstances: { rotation: ANGLE, scale: RATIO, opacity: OPACITY },
  pillBadgeInstances: { rotation: ANGLE, scale: RATIO, opacity: OPACITY },
  userImageInstances: {
    rotation: ANGLE,
    scale: RATIO,
    opacity: OPACITY,
    shadowOpacity: SHADOW_OPACITY,
    brightness: ADJUSTMENT,
    contrast: ADJUSTMENT,
    saturation: ADJUSTMENT,
    hue: ADJUSTMENT,
    temperature: ADJUSTMENT,
    tintStrength: ADJUSTMENT,
    vignette: ADJUSTMENT,
    cropZoom: ADJUSTMENT,
    panX: ADJUSTMENT,
    panY: ADJUSTMENT,
    cropRotation: ANGLE,
    notch: CANVAS_SHARE,
  },
  chartInstances: { scale: RATIO, rotation: ANGLE, opacity: OPACITY },
};

type El = Readonly<Record<string, unknown>>;

const UNKNOWN = { kind: 'unknown' } as const;

type Box = NonNullable<ReturnType<GateAdapter['box']>>;

/** The square a notch cuts from the top-right corner of `box`, clamped as the renderer clamps it. */
function notchCut(box: Box | null, side: number): Box | null {
  if (!box) return null;
  const n = Math.min(side, Math.min(box.width, box.height) / 2);
  return { x: box.x + box.width - n, y: box.y, width: n, height: n };
}

/**
 * What an image paints: every pixel lies between black and white, or between the duotone's two
 * colours when both are set. Anything that can leave that range, or that does not fill the box
 * (a mask, a partial opacity, a tint), is not provable.
 */
function photoCover(el: El): ReturnType<GateAdapter['cover']> {
  const hasTint = str(el, 'tint') !== '' || num(el, 'tintStrength') !== 0;
  if (hasTint || str(el, 'mask') !== '' || num(el, 'opacity', 1) < 1) return UNKNOWN;
  const low = str(el, 'duotoneLow');
  const high = str(el, 'duotoneHigh');
  if (low === '' || high === '') return { kind: 'photo', low: '#000000', high: '#ffffff' };
  // The filter chain (`imageFilters.ts`) runs the duotone after every other colour filter,
  // which then maps the photo onto its ramp; only a vignette after it can leave that range.
  const recoloured = num(el, 'vignette') !== 0;
  return recoloured ? UNKNOWN : { kind: 'photo', low, high };
}
const isRecord = (v: unknown): v is El => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (el: El, field: string): string => (typeof el[field] === 'string' ? el[field] : '');
const num = (el: El, field: string, fallback = 0): number => {
  const v = el[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
};

const ROTATED = 'rotated, not checkable';
const isRotated = (el: Readonly<Record<string, unknown>>): boolean =>
  num(el, 'rotation') % 360 !== 0;

/** Editor icons are drawn 120 px across at scale 1, centred on their x/y (as `boundsOf`). */
const ICON_SIZE = 120;
/**
 * Text is laid out by the renderer's own code (`plainTextLines`, a port of Konva's wrap, and
 * `layoutRichTextBlock`, routed by `usesRichText` as `CanvasText` routes), with the glyph
 * measure replaced by the widest advance of each code point in the fonts the Studio ships
 * (`fontWidths.generated.ts`, from `scripts/generate-font-widths.mjs`) plus a kerning margin per
 * glyph pair. A width is thus never below what the font draws. A font family without a table, or a
 * code point the tables do not cover (CJK, emoji, a code point the browser draws in a fallback
 * font), cannot be measured: the gate then fails `bounds` closed.
 */
const FLAT_EM = 1.2; // only to size a box that is flagged anyway
/** The widest positive kerning pair of the shipped fonts is about 0.15 em; 0.06 em per pair covers every realistic pair. */
const KERN_EM = 0.06;

const tables = new Map<string, Map<number, number>>();
/** `regular` is 400 and `bold` is 700; the other classes carry their weight as the name. */
const classWeight = (name: string): number =>
  name === 'regular' ? 400 : name === 'bold' ? 700 : Number(name);

/**
 * The width class that measures `weight`: the class of that weight when the family ships one,
 * else the next heavier one (never narrower than the face drawn), else the heaviest it has.
 */
const classes = new Map<string, string | null>();
function widthClass(family: string, weight: number): string | null {
  const memo = `${family}/${weight}`;
  const known = classes.get(memo);
  if (known !== undefined) return known;
  const prefix = `${family}/`;
  const shipped = Object.keys(FONT_WIDTHS)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .sort((a, b) => classWeight(a) - classWeight(b));
  const picked = shipped.find((name) => classWeight(name) >= weight) ?? shipped.at(-1) ?? null;
  classes.set(memo, picked);
  return picked;
}

function widthTable(family: string, weight: number): Map<number, number> | null {
  const cls = widthClass(family, weight);
  if (cls === null) return null;
  const key = `${family}/${cls}`;
  const cached = tables.get(key);
  if (cached) return cached;
  const raw = FONT_WIDTHS[key];
  if (raw === undefined) return null;
  const table = new Map<number, number>();
  for (const entry of raw.split(',')) {
    const [cp, w] = entry.split(':');
    table.set(parseInt(cp!, 16), Number(w));
  }
  tables.set(key, table);
  return table;
}

/** The first family of a CSS font stack, unquoted and with legacy names replaced. */
function familyOf(fontFamily: string): string {
  const first =
    fontFamily
      .split(',')[0]
      ?.trim()
      .replace(/^["']|["']$/g, '') ?? '';
  return first === '' ? '' : aliasFontFamily(first);
}

/** The weight a style string asks for: a numeric token, else bold is 700 and the rest 400. */
function weightOfStyle(style: string): number {
  const numeric = /\b([1-9]00)\b/.exec(style);
  if (numeric) return Number(numeric[1]);
  return style.includes('bold') ? 700 : 400;
}

/** `normal`, `italic`, `bold` or `bold italic`: a weight of 600 or more, or the word bold, is bold. */
function normalFontStyle(fontStyle: string): 'normal' | 'italic' | 'bold' | 'bold italic' {
  const tokens = fontStyle.toLowerCase().split(/\s+/);
  const bold = tokens.some(
    (t) => t === 'bold' || t === 'bolder' || (/^\d+$/.test(t) && Number(t) >= 600)
  );
  const italic = tokens.some((t) => t === 'italic' || t === 'oblique');
  return bold ? (italic ? 'bold italic' : 'bold') : italic ? 'italic' : 'normal';
}

interface Note {
  reason: string | null;
}

/** Width of `text` under one face, from the tables; records why it cannot when it cannot. */
function tableWidth(
  text: string,
  fontSize: number,
  family: string,
  weight: number,
  note: Note
): number {
  if (text === '') return 0;
  const table = widthTable(familyOf(family), weight);
  if (!table) {
    note.reason ??= `text width not checkable (no width table for font "${family}")`;
  }
  let units = 0;
  let count = 0;
  for (const ch of text) {
    const w = table?.get(ch.codePointAt(0)!);
    if (table && w === undefined) {
      note.reason ??= `text width not checkable (U+${ch.codePointAt(0)!.toString(16).toUpperCase()} is outside the font tables)`;
    }
    units += w === undefined ? FLAT_EM * 1000 : w;
    count += 1;
  }
  return (units / 1000 + KERN_EM * (count - 1)) * fontSize;
}

interface TextProps {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: 'normal' | 'italic' | 'bold' | 'bold italic';
  /** A numeric `fontWeight`; null when the text has none. */
  fontWeight: number | null;
  width: number;
  letterSpacing: number;
  accent: TextAccent | null;
}

// No `wrap`, `padding` or `richText`: the renderer passes none of them to the text node, so a
// template that sets them is drawn with word wrap, no padding and routing by content.
const textPropsOf = (el: Readonly<Record<string, unknown>>): TextProps => {
  const accent = el['accent'];
  return {
    text: str(el, 'text'),
    fontSize: num(el, 'fontSize'),
    fontFamily: str(el, 'fontFamily'),
    fontStyle: normalFontStyle(str(el, 'fontStyle')),
    fontWeight: typeof el['fontWeight'] === 'number' ? el['fontWeight'] : null,
    width: num(el, 'width'),
    // em, applied after every glyph by the run measure, as the renderer's Konva nodes do.
    letterSpacing: num(el, 'letterSpacing'),
    accent: isRecord(accent) ? (accent as unknown as TextAccent) : null,
  };
};

/** The run measure of the renderer, backed by the tables. */
function tableRunMeasure(p: TextProps, note: Note): MeasureRun {
  const accentBold = p.accent?.fontStyle
    ? normalFontStyle(p.accent.fontStyle).includes('bold')
    : false;
  const measured: MeasureWidth = (text, size, family, style) => {
    // A bold request on an italic run draws the italic face (maybe synthetically emboldened):
    // use the bold table whenever bold is asked anywhere; a numeric weight is the base weight.
    const weight = Math.max(
      weightOfStyle(style),
      p.fontWeight ?? (p.fontStyle.includes('bold') ? 700 : 400),
      accentBold ? 700 : 400
    );
    return tableWidth(text, size, family, weight, note);
  };
  return createRunMeasurer(
    measured,
    p.fontSize,
    p.fontFamily,
    p.fontStyle,
    p.accent,
    p.fontWeight,
    p.letterSpacing
  );
}

interface TextLayout {
  lines: number;
  unmeasurable: string | null;
}

/** Line count of a text by the renderer's own layout. */
function layoutText(p: TextProps): TextLayout {
  const note: Note = { reason: null };
  const run = tableRunMeasure(p, note);
  const inner = p.width > 0 ? p.width : Number.POSITIVE_INFINITY;
  const lines = usesRichText({ text: p.text, width: p.width }, run)
    ? layoutRichTextBlock(p.text, inner, run).length
    : plainTextLines(p.text, inner, (text) => run(text, PLAIN_STYLE)).length;
  return { lines: Math.max(1, lines), unmeasurable: note.reason };
}

/**
 * Fits a text to its box in its own font: the largest size from the legibility floor up to
 * `maxFontSize` at which no word is wider than the box (words are never broken) and the lines,
 * counted by the same layout as the gate, stay within `maxLines` (or the box `height`, when the
 * element has one). Measured with the width tables like `layoutText`, so fitting and gate agree.
 */
function fitTextToBox(
  el: Readonly<Record<string, unknown>>,
  req: { maxLines?: number; canvasHeight: number }
): { fontSize: number; fits: boolean } | null {
  const props = textPropsOf(el);
  const max = num(el, 'maxFontSize');
  if (!(max > 0) || !(props.width > 0)) return null;
  const height = num(el, 'height');
  const slot: SlotFit = {
    width: props.width,
    maxHeight: height > 0 ? height : Number.POSITIVE_INFINITY,
    fontSize: max,
    maxSize: max,
    minSize: Math.min(minTextSizePx(req.canvasHeight), max),
    lineHeight: num(el, 'lineHeight', 1.2),
    wholeWords: true,
    ...(req.maxLines === undefined ? {} : { maxLines: req.maxLines }),
    countLines: (size) => layoutText({ ...props, fontSize: size }).lines,
  };
  const measureAt = (size: number) => (text: string) =>
    tableRunMeasure({ ...props, fontSize: size }, { reason: null })(text, PLAIN_STYLE);
  const fontSize = fitFontSizeToSlot(props.text, slot, measureAt);
  return { fontSize, fits: slotFits(props.text, slot, measureAt, fontSize) };
}

/** The widest explicit line of a text that does not wrap (a badge), and how many lines it has. */
function widestLine(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: string
): { width: number; lines: number; unmeasurable: string | null } {
  const note: Note = { reason: null };
  const weight = normalFontStyle(fontStyle).includes('bold') ? 700 : 400;
  const parts = text.split('\n');
  const width = Math.max(
    ...parts.map((line) => tableWidth(line, fontSize, fontFamily, weight, note))
  );
  return { width, lines: parts.length, unmeasurable: note.reason };
}

/**
 * `BINDABLE_FIELDS` without the fields that are not colours: fonts, and `src` (bound only to the logo).
 */
const COLOR_FIELDS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(BINDABLE_FIELDS).map(([key, fields]) => [
    key,
    fields.filter((field) => field !== 'src' && !field.startsWith('font')),
  ])
);

/**
 * stateKey -> fields that name an image file. `templateGeometry.vitest.ts` goes red on a string
 * field of a kind that looks like one (`src`, `imageSrc`, ...) and is not listed here.
 */
export const ASSET_FIELDS: Readonly<Record<string, readonly string[]>> = {
  userImageInstances: ['src'],
  frameInstances: ['imageSrc'],
  assetInstances: ['src'],
};

/** Finds the illustration a given id draws, as the renderer does (`findIllustrationById`). */
export type IllustrationLookup = (id: string) => IllustrationDef | undefined;

/**
 * The lookup over a list of definitions, first match wins (the registry's order: kawaii, then
 * the SVG sets). A host builds it from its catalogue with `loadIllustrationLookup`.
 */
export const illustrationLookup =
  (defs: readonly IllustrationDef[]): IllustrationLookup =>
  (id) =>
    defs.find((def) => def.id === id);

/** The lookup over the registered catalogue: the same data `findIllustrationById` reads. */
export async function loadIllustrationLookup(): Promise<IllustrationLookup> {
  return illustrationLookup(await getAllIllustrations());
}

/**
 * The gate adapter. `lookup` resolves an illustration id the way the renderer does; the renderer
 * ignores an element's declared `source`, so the gate must not trust it either.
 */
export function createTemplateGateAdapter(lookup: IllustrationLookup): GateAdapter {
  const adapter: GateAdapter = {
    geometry: TEMPLATE_GEOMETRY,
    colorFields: COLOR_FIELDS,
    assetFields: ASSET_FIELDS,
    nestedColors(stateKey, el) {
      const out: { field: string; value: string }[] = [];
      const add = (field: string, value: unknown) => {
        if (typeof value === 'string') out.push({ field, value });
      };
      const stops = (field: string, gradient: unknown) => {
        const list = isRecord(gradient) ? gradient['stops'] : null;
        if (Array.isArray(list))
          for (const stop of list) if (isRecord(stop)) add(field, stop['color']);
      };
      if (stateKey === 'shapeInstances' || stateKey === 'additionalTexts') {
        stops('fillGradient', el['fillGradient']);
      }
      if (stateKey === 'additionalTexts') {
        if (isRecord(el['accent'])) add('accent', el['accent']['fill']);
        if (isRecord(el['marker'])) {
          add('marker', el['marker']['fill']);
          add('marker', el['marker']['color']);
        }
      }
      if (stateKey === 'chartInstances' && Array.isArray(el['colors'])) {
        for (const color of el['colors']) add('colors', color);
      }
      return out;
    },
    assetRefs(stateKey, el, id) {
      if (stateKey === 'illustrationInstances') {
        const illustrationId = str(el, 'illustrationId');
        const def = lookup(illustrationId);
        // Kawaii art is drawn from the instance's own id when `source` says kawaii; any other
        // source is resolved by id alone and the declared `source` is never read.
        const kawaiiMismatch = el['source'] === 'kawaii' && def?.source !== 'kawaii';
        return [
          {
            kind: 'illustration',
            id:
              def && !kawaiiMismatch
                ? `${def.source}:${illustrationId}`
                : `unresolved:${illustrationId}`,
          },
        ];
      }
      if (stateKey === 'assetInstances') {
        const assetId = str(el, 'assetId');
        return [{ kind: assetId.startsWith('emoji-') ? 'emoji' : 'sticker', id: assetId }];
      }
      if (stateKey === 'iconStates') {
        const catalogId = catalogIconId(id, { [id]: el as IconIdCarrier });
        // A stored SVG copy is what gets drawn, whatever `iconId` or `source` claim. It cannot be
        // checked against the set offline, so a template may not carry one.
        if (str(el, 'svg') !== '' || isRecord(el['source'])) {
          return [{ kind: 'stored-svg', id: catalogId }];
        }
        return [{ kind: 'icon', id: catalogId.replace(/^iconify:/, '') }];
      }
      return [];
    },
    fitText: fitTextToBox,
    lineCount(stateKey, el) {
      if (stateKey !== 'additionalTexts' || typeof el['text'] !== 'string') return 1;
      return layoutText(textPropsOf(el)).lines;
    },
    boundsProblem(stateKey, el) {
      // Images, frames and charts turn about a pivot of their own and their paint is not
      // modelled: a rotated one cannot be placed against a frame.
      if (
        (stateKey === 'userImageInstances' ||
          stateKey === 'frameInstances' ||
          stateKey === 'chartInstances') &&
        isRotated(el)
      ) {
        return ROTATED;
      }
      return null;
    },
    box(stateKey, el, lines) {
      const x = num(el, 'x');
      const y = num(el, 'y');
      switch (stateKey) {
        case 'additionalTexts': {
          // The node is scaled as a whole: layout at the unscaled width, drawn `scale` times larger.
          const scale = num(el, 'scale', 1) || 1;
          return {
            x,
            y,
            width: num(el, 'width') * scale,
            height: num(el, 'fontSize') * num(el, 'lineHeight', 1.2) * lines * scale,
          };
        }
        case 'shapeInstances': {
          const width = num(el, 'width') * num(el, 'scaleX', 1);
          const height = num(el, 'height') * num(el, 'scaleY', 1);
          // A shape turns about its centre: its extent is the box of the turned rectangle.
          const angle = (num(el, 'rotation') * Math.PI) / 180;
          const cos = Math.abs(Math.cos(angle));
          const sin = Math.abs(Math.sin(angle));
          const w = width * cos + height * sin;
          const h = width * sin + height * cos;
          return { x: x - w / 2, y: y - h / 2, width: w, height: h };
        }
        case 'chartInstances': {
          const scale = num(el, 'scale', 1) || 1;
          return { x, y, width: num(el, 'width') * scale, height: num(el, 'height') * scale };
        }
        case 'userImageInstances': {
          // Scaled about its top-left, as the image group draws it.
          const scale = num(el, 'scale', 1) || 1;
          return { x, y, width: num(el, 'width') * scale, height: num(el, 'height') * scale };
        }
        case 'iconStates': {
          // An icon turns about its centre: its extent is the box of the turned square.
          const angle = (num(el, 'rotation') * Math.PI) / 180;
          const turn = Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle));
          const size = ICON_SIZE * num(el, 'scale', 1) * turn;
          return { x: x - size / 2, y: y - size / 2, width: size, height: size };
        }
        case 'pillBadgeInstances': {
          // Top-left anchored; the text is as wide as its widest line, one line per break.
          const scale = num(el, 'scale', 1);
          const fontSize = num(el, 'fontSize');
          const { width, lines: count } = widestLine(
            str(el, 'text'),
            fontSize,
            str(el, 'fontFamily'),
            str(el, 'fontStyle')
          );
          return {
            x,
            y,
            width: (width + num(el, 'paddingX') * 2) * scale,
            height: (count * fontSize + num(el, 'paddingY') * 2) * scale,
          };
        }
        case 'circleBadgeInstances': {
          const radius = num(el, 'radius') * num(el, 'scale', 1);
          return { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 };
        }
        default:
          return null;
      }
    },
    text(stateKey, el) {
      const opacity = num(el, 'opacity', 1);
      const rotated = isRotated(el);
      const scale = num(el, 'scale', 1) || 1;
      if (stateKey === 'additionalTexts') {
        const props = textPropsOf(el);
        const boundsProblem = rotated ? ROTATED : layoutText(props).unmeasurable;
        return {
          fill: typeof el['fill'] === 'string' ? el['fill'] : '',
          fontSize: props.fontSize * scale,
          bold:
            props.fontWeight !== null ? props.fontWeight >= 700 : props.fontStyle.includes('bold'),
          opacity,
          ...(boundsProblem ? { boundsProblem } : {}),
          ...(el['fillGradient'] ? { notCheckable: 'text gradient not checkable' } : {}),
        };
      }
      if (stateKey === 'pillBadgeInstances') {
        const fontSize = num(el, 'fontSize');
        const boundsProblem = rotated
          ? ROTATED
          : widestLine(str(el, 'text'), fontSize, str(el, 'fontFamily'), str(el, 'fontStyle'))
              .unmeasurable;
        return {
          fill: str(el, 'textColor'),
          fontSize: fontSize * scale,
          bold: normalFontStyle(str(el, 'fontStyle')).includes('bold'),
          opacity,
          ground: str(el, 'backgroundColor'),
          ...(boundsProblem ? { boundsProblem } : {}),
        };
      }
      if (stateKey === 'circleBadgeInstances') {
        // Judged on its smallest line, and bold only when every line is.
        const lines = Array.isArray(el['textLines']) ? el['textLines'].filter(isRecord) : [];
        // Each line is a centred, one-line box 2r wide; its rectangle must sit in the disc.
        const radius = num(el, 'radius');
        let boundsProblem: string | null = rotated ? ROTATED : null;
        for (const l of lines) {
          if (boundsProblem || str(l, 'text') === '') continue;
          const fontSize = num(l, 'fontSize');
          const {
            width,
            lines: count,
            unmeasurable,
          } = widestLine(
            str(l, 'text'),
            fontSize,
            str(l, 'fontFamily'),
            l['fontWeight'] === 'bold' ? 'bold' : 'normal'
          );
          const reach = Math.abs(num(l, 'yOffset')) + fontSize / 2;
          if (unmeasurable) boundsProblem = unmeasurable;
          else if (count > 1 || width > radius * 2) boundsProblem = 'text wraps inside the disc';
          else if (Math.hypot(width / 2, reach) > radius) boundsProblem = 'text leaves the disc';
        }
        return {
          fill: str(el, 'textColor'),
          fontSize: (lines.length ? Math.min(...lines.map((l) => num(l, 'fontSize'))) : 0) * scale,
          bold: lines.length > 0 && lines.every((l) => l['fontWeight'] === 'bold'),
          opacity,
          ground: str(el, 'backgroundColor'),
          ...(boundsProblem ? { boundsProblem } : {}),
        };
      }
      return null;
    },
    cover(stateKey, el, canvasWidth) {
      // Texts paint no ground. A flat opaque shape is one, a photo is a range of grounds, a
      // translucent shape, a glow, grain or a shade is an overlay; every other kind (frame,
      // chart, badge, icon, sticker, illustration) is not provably any of them.
      if (stateKey === 'additionalTexts') return null;
      const blend = el['blendMode'];
      const untransformed = (blend === undefined || blend === 'normal') && !isRotated(el);
      const notch = num(el, 'notch');
      const cut = notch > 0 ? notchCut(adapter.box(stateKey, el, 1), notch * canvasWidth) : null;
      if (stateKey === 'userImageInstances') {
        const photo = untransformed ? photoCover(el) : UNKNOWN;
        return cut && photo ? { ...photo, cut } : photo;
      }
      if (stateKey !== 'shapeInstances') return UNKNOWN;
      const type = el['type'];
      const shade = el['shade'];
      const glow = el['glow'] === true && (shade === undefined || shade === null);
      // Only a plain rectangle fills its box; any other shape (or rounded corners) leaves
      // parts of the box bare, and a text there sits on whatever lies below. A glow ellipse
      // is the exception: its bare corners are glow alpha 0, inside the range it judges.
      const plain = type === undefined || type === 'rect' || (glow && type === 'ellipse');
      if (!plain || num(el, 'cornerRadius') !== 0) return UNKNOWN;
      const gradient = el['fillGradient'];
      const fill = parseColor(str(el, 'fill'));
      if (!untransformed || !fill) return UNKNOWN;
      const grainAmount = Math.min(1, num(el, 'grain'));
      const mods = {
        ...(cut ? { cut } : {}),
        ...(el['pattern'] === 'dots' ? { dots: true as const } : {}),
        ...(grainAmount > 0
          ? {
              grain: {
                fill: el['grainTone'] === 'light' ? '#ffffff' : '#000000',
                alpha: [0, (grainAmount * GRAIN_SPECK_ALPHA) / 255] as [number, number],
              },
            }
          : {}),
      };
      if (shade === 'bottom' || shade === 'top') {
        return fill.a === 1 && num(el, 'opacity', 1) === 1
          ? { kind: 'shade', fill: str(el, 'fill'), direction: shade, ...mods }
          : UNKNOWN;
      }
      if (shade || (!glow && gradient !== undefined && gradient !== null)) return UNKNOWN;
      if (glow) {
        // Full `fill` at the centre, nothing at the edge: an alpha anywhere in [0, opacity].
        return fill.a === 1
          ? {
              kind: 'range',
              fill: str(el, 'fill'),
              alpha: [0, num(el, 'opacity', 1)],
              ...mods,
            }
          : UNKNOWN;
      }
      const alpha = num(el, 'opacity', 1) * fill.a;
      if (alpha < 1) return { kind: 'veil', fill: toHex({ ...fill, a: 1 }), alpha, ...mods };
      return { kind: 'solid', fill: str(el, 'fill'), ...mods };
    },
  };
  return adapter;
}

export const TEMPLATE_GATE_ADAPTER: GateAdapter = createTemplateGateAdapter(() => undefined);
