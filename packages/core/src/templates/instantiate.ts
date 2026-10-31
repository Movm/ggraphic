// SPDX-License-Identifier: MPL-2.0
import {
  brandFingerprint,
  isBindingRef,
  resolveRef,
  withBinding,
  type BindingRef,
} from '../brand/bindings.js';
import { type BrandPack } from '../brand/brandPack.js';
import { normalizeColor } from '../color/color.js';
import { brandLayout, logoEnvelope, safeArea, type LogoCorner } from '../brand/layout.js';
import { fitLogoBox, type Box } from '../brand/logoFit.js';
import { deriveSchemes, type Scheme, type SchemeId } from '../brand/schemes.js';

export type GeometryAxis = 'x' | 'y' | 'w' | 'h' | 's' | 'k';
/** stateKey → field → axis. 'page' is the page's own fields. Unlisted numbers stay as they are. */
export type GeometryTable = Readonly<Record<string, Readonly<Record<string, GeometryAxis>>>>;
export type TemplateFrameKind = 'canvas' | 'safe';

/** What placing needs of a template; a parsed template file is assignable to it. */
export interface TemplateInput {
  id: string;
  version: number;
  formats: readonly string[];
  schemes: readonly SchemeId[];
  pages: readonly { state: Readonly<Record<string, unknown>> }[];
  frames?: Readonly<Record<string, TemplateFrameKind>>;
  fixed?: Readonly<Record<string, readonly string[]>>;
  logoCorners?: readonly LogoCorner[];
  placeholders?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Text budgets by element id; a fitted text takes its line limit from here. */
  slots?: Readonly<Record<string, { budget: { maxLines?: number } }>>;
  blocks?: readonly { id: string; elementIds: readonly string[] }[];
}

/** What a text fit is asked: the slot's line limit and the canvas height (for the legibility floor). */
export interface TextFitRequest {
  maxLines?: number;
  /** How far down the text may grow from its top (`roomBelow`); the fit keeps a gap of a quarter line below it. */
  maxHeight?: number;
  canvasHeight: number;
}

/** The size a text is fitted to; `fits` is false when it does not fit even at the floor. */
export interface TextFit {
  fontSize: number;
  fits: boolean;
}

/**
 * Fits a text that carries `maxFontSize` to its box in the font it now has: the largest size from
 * the floor up to `maxFontSize` at which it fits. Null when the element cannot be fitted (no
 * size or width to go by). The editor fills it in (`GateAdapter.fitText`), so that fitting, the
 * render gate and the canvas measure alike.
 */
export type FitText = (
  el: Readonly<Record<string, unknown>>,
  req: TextFitRequest
) => TextFit | null;

export interface InstantiateContext {
  brand: BrandPack;
  canvas: { width: number; height: number };
  /** The canvas's aspect, one of `TemplateInput.formats`. */
  format: string;
  geometry: GeometryTable;
  schemeId?: SchemeId | null;
  /** Default 'en'. */
  locale?: string;
  logoSizeOf?: (src: string) => { width: number; height: number } | null;
  /**
   * The host's fallback stack for fonts, e.g. `'Arial, sans-serif'`, or a function of the font role
   * (`'quoteEmphasis'`) when serif roles fall back differently. A bound font field is written as
   * `<family>, <fallback>`; the binding's `value` stays the bare family.
   */
  fontFallback?: string | ((role: string) => string);
  /** Fits every text with a numeric `maxFontSize` once it has its font, width and text. Without it the size stays as placed. */
  fitText?: FitText;
  /** The box an element covers (`GateAdapter.box` with one line); with `fitText`, bounds a fitted text by the element below it. */
  boxOf?: ElementBox;
}

/** The box of an element in canvas px, or null if it has none. */
export type ElementBox = (
  stateKey: string,
  el: Readonly<Record<string, unknown>>
) => { x: number; y: number; width: number; height: number } | null;

/**
 * How far down the text `el` may grow before it meets the nearest element below it that overlaps
 * it horizontally (any kind; its top must lie below the text's top, so the page and a plate the
 * text sits on never limit it); undefined when nothing lies below. Positions are as placed:
 * nothing is moved, so a stack of texts is limited by the original top of the next one.
 */
export function roomBelow(
  state: Readonly<Record<string, unknown>>,
  stateKey: string,
  el: Readonly<Record<string, unknown>>,
  boxOf: ElementBox
): number | undefined {
  const self = boxOf(stateKey, el);
  if (!self) return undefined;
  let top = Number.POSITIVE_INFINITY;
  forEachElement(state as Record<string, unknown>, (other, key) => {
    if (other === el) return;
    const box = boxOf(key, other);
    if (!box || !(box.y > self.y + 1)) return;
    if (!(self.x + 1 < box.x + box.width && box.x + 1 < self.x + self.width)) return;
    top = Math.min(top, box.y);
  });
  return Number.isFinite(top) ? top - self.y : undefined;
}

/**
 * Refusals: `format` (the canvas aspect is not declared), `no-scheme` (the brand keeps none of the
 * template's worlds), `bind` (an unknown bind ref), `geometry` (a fraction outside 0..1) and
 * `empty` (the template has no page).
 */
export type InstantiateResult =
  | { ok: true; state: Record<string, unknown>; schemeId: SchemeId }
  | { ok: false; reason: 'format' | 'no-scheme' | 'bind' | 'geometry' | 'empty' };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Whether a value is out of reach of its axis: a fraction outside 0..1, or an array that can't scale. */
const unplaceable = (v: unknown, axis: GeometryAxis): boolean => {
  if (Array.isArray(v)) {
    // Only the s axis scales a list (a dash pattern is a list of px lengths).
    return axis !== 's' || !v.every((e) => isNum(e) && e >= 0 && e <= 1);
  }
  return axis !== 'k' && isNum(v) && (v < 0 || v > 1);
};

/** The template's worlds that the brand keeps, in the template's order. */
export function offeredSchemes(t: Pick<TemplateInput, 'schemes'>, brand: BrandPack): SchemeId[] {
  const have = new Set(deriveSchemes(brand).map((s) => s.id));
  return t.schemes.filter((id) => have.has(id));
}

function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as T;
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) as T;
  return v;
}

/** The ref a template bind entry names: a plain string, or `{ref}`. */
function refOf(entry: unknown): unknown {
  return isObj(entry) ? entry['ref'] : entry;
}

/** Page keys that hold page metadata, never elements. */
const PAGE_KEYS = new Set([
  'bind',
  'templateRef',
  'groups',
  'brandScheme',
  'brandStamp',
  'layerOrder',
]);

/** Every element of the page: array items and record entries, with the state key they sit under. */
export function forEachElement(
  state: Obj,
  visit: (el: Obj, key: string, id: string) => void
): void {
  for (const [key, value] of Object.entries(state)) {
    if (PAGE_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const el of value) if (isObj(el)) visit(el, key, String(el['id'] ?? ''));
    } else if (isObj(value)) {
      for (const [id, el] of Object.entries(value))
        if (isObj(el)) visit(el, key, String(el['id'] ?? id));
    }
  }
}

/**
 * Places a template's first page on a canvas: fractions of the brand grid become pixels, bound
 * fields take the values of the chosen world, the logo goes to a free corner. Pure: the input is
 * not touched and the same input gives the same page. A template with an unknown bind ref or a
 * geometry fraction outside 0..1, or a number list on an axis other than `s`, is refused (`bind`, `geometry`).
 */
export function instantiateTemplatePage(
  t: TemplateInput,
  ctx: InstantiateContext
): InstantiateResult {
  if (!t.formats.includes(ctx.format)) return { ok: false, reason: 'format' };
  const offered = offeredSchemes(t, ctx.brand);
  const schemeId = ctx.schemeId && offered.includes(ctx.schemeId) ? ctx.schemeId : offered[0];
  if (!schemeId) return { ok: false, reason: 'no-scheme' };
  const scheme = deriveSchemes(ctx.brand).find((s) => s.id === schemeId) as Scheme;

  const src = t.pages[0]?.state;
  if (!src) return { ok: false, reason: 'empty' };
  const state = clone(src) as Obj;

  // Validate first, so a refusal never depends on what the later steps would have skipped.
  const checkBinds = (el: Obj) =>
    !isObj(el['bind']) || Object.values(el['bind']).every((e) => isBindingRef(refOf(e)));
  if (!checkBinds(state)) return { ok: false, reason: 'bind' };
  let bad: 'bind' | 'geometry' | null = null;
  forEachElement(state, (el, key) => {
    if (!checkBinds(el)) bad ??= 'bind';
    for (const [field, axis] of Object.entries(ctx.geometry[key] ?? {})) {
      const v = el[field];
      if (unplaceable(v, axis)) bad ??= 'geometry';
    }
  });
  for (const [field, axis] of Object.entries(ctx.geometry['page'] ?? {})) {
    const v = state[field];
    if (unplaceable(v, axis)) bad ??= 'geometry';
  }
  if (bad) return { ok: false, reason: bad };

  const { width: W, height: H } = ctx.canvas;
  const S = Math.min(W, H);
  const layout = brandLayout(ctx.brand);
  const frames: Record<TemplateFrameKind, Box> = {
    canvas: { x: 0, y: 0, width: W, height: H },
    safe: safeArea(layout, ctx.canvas),
  };

  const place = (el: Obj, table: Readonly<Record<string, GeometryAxis>> | undefined, F: Box) => {
    for (const [field, axis] of Object.entries(table ?? {})) {
      const v = el[field];
      if (Array.isArray(v)) {
        // Validated above: only the s axis reaches here with a list of fractions.
        el[field] = v.map((e: number) => Math.round(e * S));
        continue;
      }
      if (!isNum(v)) continue;
      el[field] =
        axis === 'x'
          ? Math.round(F.x + v * F.width)
          : axis === 'y'
            ? Math.round(F.y + v * F.height)
            : axis === 'w'
              ? Math.round(v * F.width)
              : axis === 'h'
                ? Math.round(v * F.height)
                : axis === 's'
                  ? Math.round(v * S)
                  : (v * S) / 1080;
    }
  };

  const bindFields = (el: Obj, id: string) => {
    if (!isObj(el['bind'])) return;
    const fixed = t.fixed?.[id] ?? [];
    let bind: Obj | undefined;
    for (const [field, entry] of Object.entries(el['bind'])) {
      const ref = refOf(entry) as BindingRef;
      if (ref === 'brand.logo' || fixed.includes(field)) continue;
      const resolved = resolveRef(ref, ctx.brand, scheme);
      if (resolved === null) continue;
      const color = !ref.startsWith('font.');
      const value = color ? normalizeColor(resolved) : resolved;
      const fallback =
        !color && ctx.fontFallback !== undefined
          ? typeof ctx.fontFallback === 'function'
            ? ctx.fontFallback(ref.slice(5))
            : ctx.fontFallback
          : '';
      el[field] = fallback ? `${value}, ${fallback}` : value;
      bind = withBinding(bind as never, field, { ref, value }) as Obj;
    }
    if (bind) el['bind'] = bind;
    else delete el['bind'];
  };

  place(state, ctx.geometry['page'], frames.canvas);
  bindFields(state, 'page');

  const locale = ctx.locale ?? 'en';
  const texts = t.placeholders?.[locale] ?? t.placeholders?.['en'];
  const removed = new Set<string>();
  forEachElement(state, (el, key, id) => {
    place(el, ctx.geometry[key], frames[t.frames?.[id] ?? 'safe']);
    // Logos are bound by the logo step below.
    const logoBound = isObj(el['bind']) && refOf((el['bind'] as Obj)['src']) === 'brand.logo';
    if (logoBound) {
      const { src: logoBind, ...others } = el['bind'] as Obj;
      el['bind'] = others;
      bindFields(el, id);
      el['bind'] = { ...(isObj(el['bind']) ? el['bind'] : {}), src: logoBind };
    } else bindFields(el, id);
    if (key === 'additionalTexts' && !isNum(el['lineHeight'])) {
      el['lineHeight'] = ctx.brand.lineHeightFactor;
    }
    const text = texts?.[id];
    if (text !== undefined) el['text'] = text;
  });

  // Sizes fitted to the brand's fonts, up to the prototype's size.
  if (ctx.fitText) {
    forEachElement(state, (el, key, id) => {
      if (key !== 'additionalTexts' || !isNum(el['maxFontSize'])) return;
      const maxLines = t.slots?.[id]?.budget.maxLines;
      const maxHeight = ctx.boxOf ? roomBelow(state, key, el, ctx.boxOf) : undefined;
      const fit = ctx.fitText!(el, {
        ...(maxLines === undefined ? {} : { maxLines }),
        ...(maxHeight === undefined ? {} : { maxHeight }),
        canvasHeight: H,
      });
      if (fit) el['fontSize'] = fit.fontSize;
    });
  }

  // The logo.
  const layerIds = (key: string) =>
    Array.isArray(state[key]) ? (state[key] as Obj[]).map((e) => String(e['id'])) : [];
  const images = state['userImageInstances'];
  if (Array.isArray(images)) {
    // The brand's corner if declared; else a declared corner on the same horizontal edge; else the first.
    const declared = t.logoCorners ?? [];
    const edge = layout.logoCorner.split('-')[0];
    const corner = declared.includes(layout.logoCorner)
      ? layout.logoCorner
      : (declared.find((c) => c.split('-')[0] === edge) ?? declared[0]);
    state['userImageInstances'] = images.filter((raw) => {
      const el = raw as Obj;
      if (!isObj(el['bind']) || refOf(el['bind']['src']) !== 'brand.logo') return true;
      const logo = resolveRef('brand.logo', ctx.brand, scheme);
      const size = logo ? ctx.logoSizeOf?.(logo) : null;
      if (!corner || !logo || !size) {
        removed.add(String(el['id']));
        return false;
      }
      const box = logoEnvelope(layout, ctx.canvas, corner);
      const fit = fitLogoBox(box, size, ctx.canvas);
      Object.assign(el, fit);
      el['src'] = logo;
      const known = [ctx.brand.logo, ctx.brand.logoAlt].find((l) => l?.src === logo);
      if (known) el['fileName'] = known.label;
      el['bind'] = withBinding(el['bind'] as never, 'src', {
        ref: 'brand.logo',
        value: logo,
        box,
        fit,
      });
      return true;
    });
  }

  const order = Array.isArray(state['layerOrder'])
    ? (state['layerOrder'] as unknown[]).map(String)
    : [
        ...layerIds('shapeInstances'),
        ...layerIds('userImageInstances'),
        ...layerIds('additionalTexts'),
      ];
  state['layerOrder'] = order.filter((id) => !removed.has(id));

  state['templateRef'] = { id: t.id, version: t.version };
  state['brandScheme'] = schemeId;
  state['brandStamp'] = brandFingerprint(ctx.brand);
  state['groups'] = (t.blocks ?? [])
    .map((b) => ({
      id: b.id,
      blockRef: { id: `${t.id}/${b.id}`, version: t.version },
      elementIds: b.elementIds.filter((id) => !removed.has(id)),
    }))
    .filter((g) => g.elementIds.length >= 2);

  return { ok: true, state, schemeId };
}
