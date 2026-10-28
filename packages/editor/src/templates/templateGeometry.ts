// SPDX-License-Identifier: MPL-2.0
/**
 * How each element kind's numbers move when a template is placed on a page of
 * another size (axes: x, y, w, h, font size `s`, icon scale `k`). Every top-level
 * number of a kind is either here or in `UNSCALED_FIELDS` with the reason it stays;
 * `templateGeometry.vitest.ts` builds each kind by its factory and goes red on a
 * number (or number array) that is in neither; the guard runs over the factory default
 * and a populated fixture that sets every optional number. Keyed by `stateKey`, as `BINDABLE_FIELDS` is.
 */
import { aliasFontFamily, type GateAdapter, type GeometryTable } from '@ggraphic/core';

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
    letterSpacing: 's',
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
const ADJUSTMENT = 'image adjustment (a filter strength or a share); independent of the page size';

export const UNSCALED_FIELDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  iconStates: { rotation: ANGLE, opacity: OPACITY },
  additionalTexts: {
    rotation: ANGLE,
    scale: RATIO,
    opacity: OPACITY,
    lineHeight: RATIO,
    shadowOpacity: SHADOW_OPACITY,
  },
  shapeInstances: {
    rotation: ANGLE,
    scaleX: RATIO,
    scaleY: RATIO,
    opacity: OPACITY,
    shadowOpacity: SHADOW_OPACITY,
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
  },
  chartInstances: { scale: RATIO, rotation: ANGLE, opacity: OPACITY },
};

type El = Readonly<Record<string, unknown>>;
const isRecord = (v: unknown): v is El => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (el: El, field: string): string => (typeof el[field] === 'string' ? el[field] : '');
const num = (el: El, field: string, fallback = 0): number => {
  const v = el[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
};

/** Editor icons are drawn 120 px across at scale 1, centred on their x/y (as `boundsOf`). */
const ICON_SIZE = 120;
/**
 * Text is measured with the widest advance of each code point in the fonts the Studio ships
 * (`fontWidths.generated.ts`, from `scripts/generate-font-widths.mjs`), so a width is never
 * below what the font draws. A font family without a table, or a code point the tables do not
 * cover (CJK, emoji, Thai, ...), cannot be measured: the gate then fails `bounds` closed.
 */
const FLAT_EM = 1.2; // only to size a box that is flagged anyway

const tables = new Map<string, Map<number, number>>();
function widthTable(family: string, bold: boolean): Map<number, number> | null {
  const key = `${family}/${bold ? 'bold' : 'regular'}`;
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

interface TextMetrics {
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  letterSpacing: number;
}

/** Advances of a text's characters, or why it cannot be measured. */
function advancesOf(
  text: string,
  m: TextMetrics
): { widths: number[]; unmeasurable: string | null } {
  const table = widthTable(familyOf(m.fontFamily), m.bold);
  let unmeasurable: string | null = null;
  if (!table && text !== '') {
    unmeasurable = `text width not checkable (no width table for font "${m.fontFamily}")`;
  }
  const widths = [...text].map((ch) => {
    const w = table?.get(ch.codePointAt(0)!);
    if (table && w === undefined) {
      unmeasurable ??= `text width not checkable (U+${ch.codePointAt(0)!.toString(16).toUpperCase()} is outside the font tables)`;
    }
    return ((w === undefined ? FLAT_EM * 1000 : w) / 1000) * m.fontSize + m.letterSpacing;
  });
  return { widths, unmeasurable };
}

const metricsOf = (el: Readonly<Record<string, unknown>>): TextMetrics => ({
  fontSize: num(el, 'fontSize'),
  fontFamily: str(el, 'fontFamily'),
  bold: str(el, 'fontStyle').includes('bold'),
  letterSpacing: num(el, 'letterSpacing'),
});

/** Greedy word wrap with the widths above; a word longer than the line breaks on a character. */
function wrapped(
  text: string,
  m: TextMetrics,
  width: number
): { lines: number; unmeasurable: string | null } {
  let total = 0;
  let unmeasurable: string | null = null;
  for (const line of text.split('\n')) {
    const { widths, unmeasurable: bad } = advancesOf(line, m);
    unmeasurable ??= bad;
    if (!(width > 0)) {
      total += 1;
      continue;
    }
    const chars = [...line];
    const space = advancesOf(' ', m).widths[0]!;
    let count = 1;
    let used = 0;
    let at = 0;
    // Split into words, keeping each word's character widths.
    const words: number[][] = [];
    let cur: number[] = [];
    chars.forEach((ch, i) => {
      if (ch === ' ') {
        words.push(cur);
        cur = [];
      } else cur.push(widths[i]!);
    });
    words.push(cur);
    for (const word of words) {
      const w = word.reduce((a, b) => a + b, 0);
      if (used > 0 && used + space + w <= width) {
        used += space + w;
        continue;
      }
      if (used > 0) {
        count += 1;
        used = 0;
      }
      at = 0;
      for (const cw of word) {
        if (used > 0 && used + cw > width) {
          count += 1;
          used = 0;
        }
        used += cw;
      }
      void at;
    }
    total += count;
  }
  return { lines: total, unmeasurable };
}

/** The widest line of a text with explicit breaks only (a pill does not wrap). */
function widestLine(
  text: string,
  m: TextMetrics
): { width: number; lines: number; unmeasurable: string | null } {
  let width = 0;
  let unmeasurable: string | null = null;
  const parts = text.split('\n');
  for (const line of parts) {
    const a = advancesOf(line, m);
    unmeasurable ??= a.unmeasurable;
    width = Math.max(
      width,
      a.widths.reduce((x, y) => x + y, 0)
    );
  }
  return { width, lines: parts.length, unmeasurable };
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
  return {
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
    lineCount(stateKey, el) {
      if (stateKey !== 'additionalTexts' || typeof el['text'] !== 'string') return 1;
      return wrapped(el['text'], metricsOf(el), num(el, 'width')).lines;
    },
    box(stateKey, el, lines) {
      const x = num(el, 'x');
      const y = num(el, 'y');
      switch (stateKey) {
        case 'additionalTexts':
          // Scale and rotation are ignored on purpose: the gate checks the laid-out text
          // against its own width, not where a transform puts it.
          return {
            x,
            y,
            width: num(el, 'width'),
            height: num(el, 'fontSize') * num(el, 'lineHeight', 1.2) * lines,
          };
        case 'shapeInstances': {
          const width = num(el, 'width') * num(el, 'scaleX', 1);
          const height = num(el, 'height') * num(el, 'scaleY', 1);
          return { x: x - width / 2, y: y - height / 2, width, height };
        }
        case 'chartInstances':
        case 'userImageInstances':
          return { x, y, width: num(el, 'width'), height: num(el, 'height') };
        case 'iconStates': {
          const size = ICON_SIZE * num(el, 'scale', 1);
          return { x: x - size / 2, y: y - size / 2, width: size, height: size };
        }
        case 'pillBadgeInstances': {
          // Top-left anchored; the text is as wide as its widest line, one line per break.
          const scale = num(el, 'scale', 1);
          const m = metricsOf(el);
          const { width, lines: count } = widestLine(str(el, 'text'), m);
          return {
            x,
            y,
            width: (width + num(el, 'paddingX') * 2) * scale,
            height: (count * m.fontSize + num(el, 'paddingY') * 2) * scale,
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
      const style = el['fontStyle'];
      const opacity = num(el, 'opacity', 1);
      const rotated = num(el, 'rotation') % 360 !== 0;
      const ROTATED = 'rotated, not checkable';
      if (stateKey === 'additionalTexts') {
        const unmeasurable = wrapped(str(el, 'text'), metricsOf(el), num(el, 'width')).unmeasurable;
        const boundsProblem = rotated ? ROTATED : unmeasurable;
        return {
          fill: typeof el['fill'] === 'string' ? el['fill'] : '',
          fontSize: num(el, 'fontSize'),
          bold: typeof style === 'string' && style.includes('bold'),
          opacity,
          ...(boundsProblem ? { boundsProblem } : {}),
          ...(el['fillGradient'] ? { notCheckable: 'text gradient not checkable' } : {}),
        };
      }
      if (stateKey === 'pillBadgeInstances') {
        const boundsProblem = rotated
          ? ROTATED
          : widestLine(str(el, 'text'), metricsOf(el)).unmeasurable;
        return {
          fill: str(el, 'textColor'),
          fontSize: num(el, 'fontSize'),
          bold: typeof style === 'string' && style.includes('bold'),
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
          } = widestLine(str(l, 'text'), {
            fontSize,
            fontFamily: str(l, 'fontFamily'),
            bold: l['fontWeight'] === 'bold',
            letterSpacing: 0,
          });
          const reach = Math.abs(num(l, 'yOffset')) + fontSize / 2;
          if (unmeasurable) boundsProblem = unmeasurable;
          else if (count > 1 || width > radius * 2) boundsProblem = 'text wraps inside the disc';
          else if (Math.hypot(width / 2, reach) > radius) boundsProblem = 'text leaves the disc';
        }
        return {
          fill: str(el, 'textColor'),
          fontSize: lines.length ? Math.min(...lines.map((l) => num(l, 'fontSize'))) : 0,
          bold: lines.length > 0 && lines.every((l) => l['fontWeight'] === 'bold'),
          opacity,
          ground: str(el, 'backgroundColor'),
          ...(boundsProblem ? { boundsProblem } : {}),
        };
      }
      return null;
    },
    cover(stateKey, el) {
      // Texts paint no ground. A shape is a ground only when flat and opaque; every other
      // kind (photo, frame, chart, badge, icon, sticker, illustration) is not provably one.
      if (stateKey === 'additionalTexts') return null;
      if (stateKey !== 'shapeInstances') return { kind: 'unknown' };
      const gradient = el['fillGradient'];
      const blend = el['blendMode'];
      if (
        (gradient !== undefined && gradient !== null) ||
        num(el, 'opacity', 1) < 1 ||
        (blend !== undefined && blend !== 'normal') ||
        num(el, 'rotation') % 360 !== 0
      ) {
        return { kind: 'unknown' };
      }
      return { kind: 'solid', fill: str(el, 'fill') };
    },
  };
}

export const TEMPLATE_GATE_ADAPTER: GateAdapter = createTemplateGateAdapter(() => undefined);
