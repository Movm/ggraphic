// SPDX-License-Identifier: MPL-2.0
/**
 * How each element kind's numbers move when a template is placed on a page of
 * another size (axes: x, y, w, h, font size `s`, icon scale `k`). Every top-level
 * number of a kind is either here or in `UNSCALED_FIELDS` with the reason it stays;
 * `templateGeometry.vitest.ts` builds each kind by its factory and goes red on a
 * number (or number array) that is in neither; the guard runs over the factory default
 * and a populated fixture that sets every optional number. Keyed by `stateKey`, as `BINDABLE_FIELDS` is.
 */
import type { GateAdapter, GeometryTable } from '@ggraphic/core';

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
 * Glyph widths in em for the line estimate. They are deliberately above the fonts the editor
 * ships, so the estimate is an upper bound and the gate fails closed on text it cannot measure.
 */
const LOWER_EM = 0.62;
const UPPER_EM = 0.75;
const BOLD_FACTOR = 1.08;

interface TextMetrics {
  fontSize: number;
  bold: boolean;
  letterSpacing: number;
}

const charWidth = (ch: string, m: TextMetrics): number =>
  (ch !== ch.toLowerCase() || /\d/.test(ch) ? UPPER_EM : LOWER_EM) *
    m.fontSize *
    (m.bold ? BOLD_FACTOR : 1) +
  m.letterSpacing;

const widthUpperBound = (text: string, m: TextMetrics): number =>
  [...text].reduce((sum, ch) => sum + charWidth(ch, m), 0);

/** Greedy word wrap with the widths above; a word longer than the line breaks across lines. */
function wrappedLines(text: string, m: TextMetrics & { width: number }): number {
  let total = 0;
  for (const line of text.split('\n')) {
    if (!(m.width > 0)) {
      total += 1;
      continue;
    }
    let used = 0;
    let count = 1;
    const space = charWidth(' ', m);
    for (const word of line.split(' ')) {
      let w = widthUpperBound(word, m);
      if (used > 0 && used + space + w <= m.width) {
        used += space + w;
        continue;
      }
      if (used > 0) {
        count += 1;
        used = 0;
      }
      // A word wider than the line takes whole lines and continues on the last.
      while (w > m.width) {
        count += 1;
        w -= m.width;
      }
      used = w;
    }
    total += count;
  }
  return total;
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
      return wrappedLines(el['text'], {
        width: num(el, 'width'),
        fontSize: num(el, 'fontSize'),
        bold: str(el, 'fontStyle').includes('bold'),
        letterSpacing: num(el, 'letterSpacing'),
      });
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
          // Top-left anchored; the editor measures the text with its font, here an upper bound.
          const scale = num(el, 'scale', 1);
          const fontSize = num(el, 'fontSize');
          const textWidth = widthUpperBound(str(el, 'text'), {
            fontSize,
            bold: str(el, 'fontStyle').includes('bold'),
            letterSpacing: 0,
          });
          return {
            x,
            y,
            width: (textWidth + num(el, 'paddingX') * 2) * scale,
            height: (fontSize + num(el, 'paddingY') * 2) * scale,
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
      if (stateKey === 'additionalTexts') {
        return {
          fill: typeof el['fill'] === 'string' ? el['fill'] : '',
          fontSize: num(el, 'fontSize'),
          bold: typeof style === 'string' && style.includes('bold'),
          opacity,
          ...(el['fillGradient'] ? { notCheckable: 'text gradient not checkable' } : {}),
        };
      }
      if (stateKey === 'pillBadgeInstances') {
        return {
          fill: str(el, 'textColor'),
          fontSize: num(el, 'fontSize'),
          bold: typeof style === 'string' && style.includes('bold'),
          opacity,
          ground: str(el, 'backgroundColor'),
        };
      }
      if (stateKey === 'circleBadgeInstances') {
        // Judged on its smallest line, and bold only when every line is.
        const lines = Array.isArray(el['textLines']) ? el['textLines'].filter(isRecord) : [];
        return {
          fill: str(el, 'textColor'),
          fontSize: lines.length ? Math.min(...lines.map((l) => num(l, 'fontSize'))) : 0,
          bold: lines.length > 0 && lines.every((l) => l['fontWeight'] === 'bold'),
          opacity,
          ground: str(el, 'backgroundColor'),
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
        (blend !== undefined && blend !== 'normal')
      ) {
        return { kind: 'unknown' };
      }
      return { kind: 'solid', fill: str(el, 'fill') };
    },
  };
}

export const TEMPLATE_GATE_ADAPTER: GateAdapter = createTemplateGateAdapter(() => undefined);
