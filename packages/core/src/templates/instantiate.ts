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
  blocks?: readonly { id: string; elementIds: readonly string[] }[];
}

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
function forEachElement(state: Obj, visit: (el: Obj, key: string, id: string) => void): void {
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
 * geometry fraction outside 0..1 is refused (`bind`, `geometry`).
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
      if (axis !== 'k' && isNum(v) && (v < 0 || v > 1)) bad ??= 'geometry';
    }
  });
  for (const [field, axis] of Object.entries(ctx.geometry['page'] ?? {})) {
    const v = state[field];
    if (axis !== 'k' && isNum(v) && (v < 0 || v > 1)) bad ??= 'geometry';
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
      el[field] = value;
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

  // The logo.
  const layerIds = (key: string) =>
    Array.isArray(state[key]) ? (state[key] as Obj[]).map((e) => String(e['id'])) : [];
  const images = state['userImageInstances'];
  if (Array.isArray(images)) {
    const corner = t.logoCorners?.includes(layout.logoCorner)
      ? layout.logoCorner
      : t.logoCorners?.[0];
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
