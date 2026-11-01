// SPDX-License-Identifier: MPL-2.0
import { contrastRatio, normalizeColor } from '../color/color.js';
import { fitLogoBox, type Box } from './logoFit.js';
import { type BrandColors, type BrandFonts, type BrandPack } from './brandPack.js';
import {
  SCHEME_IDS,
  SURFACE_ROLES,
  resolveScheme,
  type Scheme,
  type SchemeId,
  type SurfaceRole,
} from './schemes.js';

export type BrandColorRole = keyof BrandColors;
export type BrandFontRole = Exclude<keyof BrandFonts, 'boldFamilies' | 'cuts'>;

/** What a page field follows: a colour of the page's world, a brand colour, a brand font or the logo. */
export type BindingRef =
  SurfaceRole | `brand.${BrandColorRole}` | `font.${BrandFontRole}` | 'brand.logo';

/**
 * `value` is what the field held when the binding last wrote it; a different value means a hand edit.
 * A logo binding also carries `box`, the envelope every logo is fitted into, and `fit`, the box
 * the last fit gave it. Without them each swap would fit into the previous, already smaller box.
 * `pendingFit` marks a logo swapped while its size was unknown: its box still has to be fitted,
 * which happens as soon as the size is known, whatever the page's stamp says.
 */
export interface Binding {
  ref: BindingRef;
  value: string;
  box?: Box;
  fit?: Box;
  pendingFit?: boolean;
}

/** Per field name. */
export type Bindings = Readonly<Record<string, Binding>>;

export interface RebindContext {
  brand: BrandPack;
  /** Natural size of the brand's logo; a swapped logo is fitted into its old box when known. */
  logoSize?: { width: number; height: number } | null;
  /** Natural size of any logo by source; wins over `logoSize`, which only knows the main one. */
  logoSizeOf?: (src: string) => { width: number; height: number } | null;
  /** Size of the page, needed with `logoSize` to pick the corner a logo box keeps. */
  pageSize?: { width: number; height: number } | null;
  /**
   * Refits a text with a numeric `maxFontSize` after its font changed (the new font can be wider),
   * given the element as rebound and the page it sits on; null leaves the size as it is. A text
   * without `maxFontSize`, or one whose bound fields did not change, is never offered.
   */
  fitText?: (
    el: Readonly<Record<string, unknown>>,
    page: Readonly<Record<string, unknown>>
  ) => number | null;
}

// Record types make a missing or extra key a compile error.
const BRAND_COLOR_KEYS: Record<BrandColorRole, true> = {
  primary: true,
  secondary: true,
  accent: true,
  accentOnLight: true,
  attention: true,
  textOnDark: true,
  textOnLight: true,
  surface: true,
};
const BRAND_FONT_KEYS: Record<BrandFontRole, true> = {
  headline: true,
  body: true,
  quoteShort: true,
  quoteEmphasis: true,
  serif: true,
  condensed: true,
};

export function isBindingRef(value: unknown): value is BindingRef {
  if (typeof value !== 'string') return false;
  if ((SURFACE_ROLES as readonly string[]).includes(value)) return true;
  if (value === 'brand.logo') return true;
  if (value.startsWith('brand.')) return Object.hasOwn(BRAND_COLOR_KEYS, value.slice(6));
  if (value.startsWith('font.')) return Object.hasOwn(BRAND_FONT_KEYS, value.slice(5));
  return false;
}

/** The value a ref stands for now, or null when it cannot be resolved. */
export function resolveRef(
  ref: BindingRef,
  brand: BrandPack,
  scheme: Scheme | null
): string | null {
  if (ref === 'brand.logo') {
    const alt = brand.logoAlt;
    if (scheme && alt && alt.ground === groundClass(scheme.roles.ground)) return alt.src;
    return brand.logo?.src ?? alt?.src ?? null;
  }
  if (ref.startsWith('brand.')) {
    const v = (brand.colors as unknown as Record<string, unknown>)[ref.slice(6)];
    return typeof v === 'string' ? v : null;
  }
  if (ref.startsWith('font.')) {
    const fonts = brand.fonts;
    const role = ref.slice(5);
    const v =
      role === 'serif'
        ? (fonts.serif ?? fonts.quoteEmphasis)
        : role === 'condensed'
          ? (fonts.condensed ?? fonts.headline)
          : (fonts as unknown as Record<string, unknown>)[role];
    return typeof v === 'string' ? v : null;
  }
  return scheme?.roles[ref as SurfaceRole] ?? null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const parts = Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Identifies the parts of a brand a binding can read: colours, fonts without
 * `boldFamilies`, the markers (the colour worlds read them) and the logo source. FNV-1a 32 over the UTF-16 code units of
 * the canonical JSON (keys sorted), as 8 lower-case hex digits.
 */
export function brandFingerprint(brand: BrandPack): string {
  const { boldFamilies: _bold, ...fonts } = brand.fonts;
  const text = canonicalJson({
    colors: brand.colors,
    fonts,
    markers: brand.markers,
    logo: brand.logo?.src ?? null,
    // Only when present, so a brand without a second logo keeps its old fingerprint.
    ...(brand.logoAlt ? { logoAlt: { src: brand.logoAlt.src, ground: brand.logoAlt.ground } } : {}),
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function withBinding(bind: Bindings | undefined, field: string, binding: Binding): Bindings {
  return { ...bind, [field]: binding };
}

/** `undefined` when no binding is left. */
export function withoutBinding(bind: Bindings | undefined, field: string): Bindings | undefined {
  if (!bind) return undefined;
  const { [field]: _dropped, ...rest } = bind;
  return Object.keys(rest).length ? rest : undefined;
}

type Obj = Record<string, unknown>;

function isPlainObject(value: unknown): value is Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isColorRef(ref: BindingRef): boolean {
  return !ref.startsWith('font.') && ref !== 'brand.logo';
}

/** Splits a CSS font stack at its first comma outside quotes: the first family and the rest, comma included. */
function splitStack(stack: string): { first: string; tail: string } {
  let quote: string | null = null;
  for (let i = 0; i < stack.length; i++) {
    const ch = stack[i]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ',') return { first: stack.slice(0, i), tail: stack.slice(i) };
  }
  return { first: stack, tail: '' };
}

/** A family name without quotes and padding, lower case. */
const familyKey = (family: string) =>
  family
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim()
    .toLowerCase();

const firstFamilyKey = (stack: string) => familyKey(splitStack(stack).first);

/** The first family of a font stack, as the comparison key: 'Raleway, Arial' → 'raleway'. */
export function firstFontFamily(value: string): string {
  return firstFamilyKey(value);
}

/** Whether a ground is dark: it contrasts at least as much with white as with black. */
export function groundClass(ground: string): 'dark' | 'light' {
  const white = contrastRatio(ground, '#ffffff');
  const black = contrastRatio(ground, '#000000');
  return white !== null && black !== null && white < black ? 'light' : 'dark';
}

function hasBindings(obj: Obj): boolean {
  return isPlainObject(obj['bind']) && Object.keys(obj['bind']).length > 0;
}

function hasPendingFit(obj: Obj): boolean {
  return (
    isPlainObject(obj['bind']) &&
    Object.values(obj['bind']).some((b) => isPlainObject(b) && b['pendingFit'] === true)
  );
}

function boxOf(obj: Obj): Box | null {
  const { x, y, width, height } = obj;
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if ((width as number) <= 0 || (height as number) <= 0) return null;
  return { x, y, width, height } as Box;
}

const sameBox = (a: Box, b: Box) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * Fits a swapped logo into its envelope when the logo and page sizes are known, and returns the
 * envelope and fit to store. The envelope is the binding's `box`; a box that is not the last fit
 * was changed by hand (or the binding predates envelopes), so the current box becomes the envelope.
 */
function fitLogo(
  obj: Obj,
  binding: Binding,
  { brand, logoSize, logoSizeOf, pageSize }: RebindContext,
  src: string
): { box: Box; fit: Box } | null {
  // `logoSize` is the main logo's; any other logo with no size of its own stays pending.
  const size = logoSizeOf?.(src) ?? (src === brand.logo?.src ? logoSize : null);
  if (!size || !pageSize) return null;
  const current = boxOf(obj);
  if (!current) return null;
  const envelope =
    binding.box && binding.fit && sameBox(binding.fit, current) ? binding.box : current;
  return { box: envelope, fit: fitLogoBox(envelope, size, pageSize) };
}

/** Rebinds one object's fields; the same object when nothing changes. */
function rebindObject(obj: Obj, ctx: RebindContext, scheme: Scheme | null): Obj {
  const { brand } = ctx;
  if (!isPlainObject(obj['bind'])) return obj;
  const bind = obj['bind'] as Record<string, Binding>;
  let next: Obj | null = null;
  let nextBind: Record<string, Binding> | null = null;
  for (const [field, binding] of Object.entries(bind)) {
    const current = obj[field];
    const valid = isBindingRef(binding?.ref) && typeof binding.value === 'string';
    const color = valid && isColorRef(binding.ref);
    // A font field may carry a stack; only its first family is the brand's to follow.
    const font = valid && binding.ref.startsWith('font.');
    const edited =
      !valid ||
      typeof current !== 'string' ||
      (color
        ? normalizeColor(current) !== normalizeColor(binding.value)
        : font
          ? firstFamilyKey(current) !== firstFamilyKey(binding.value)
          : current !== binding.value);
    const resolved = edited ? null : resolveRef(binding.ref, brand, scheme);
    if (resolved === null) {
      nextBind ??= { ...bind };
      delete nextBind[field];
      continue;
    }
    const value = color ? normalizeColor(resolved) : resolved;
    // `value` is what the binding stores; the field keeps its fallback tail.
    const written = font ? value + splitStack(current as string).tail : value;
    const sameField = font
      ? firstFamilyKey(current as string) === familyKey(value)
      : current === value;
    const logo = binding.ref === 'brand.logo';
    // A swapped logo is fitted now; so is one whose fit was left pending, once its size is known.
    const fitted =
      logo && (!sameField || binding.pendingFit) ? fitLogo(next ?? obj, binding, ctx, value) : null;
    if (sameField && binding.value === value && !fitted) continue;
    next ??= { ...obj };
    if (fitted) Object.assign(next, fitted.fit);
    next[field] = sameField ? current : written;
    nextBind ??= { ...bind };
    const { pendingFit: _done, ...kept } = binding;
    nextBind[field] = {
      ...kept,
      ref: binding.ref,
      value,
      ...fitted,
      ...(logo && !fitted ? { pendingFit: true } : {}),
    };
  }
  if (!next && !nextBind) return obj;
  next ??= { ...obj };
  if (nextBind && Object.keys(nextBind).length === 0) delete next['bind'];
  else if (nextBind) next['bind'] = nextBind;
  return next;
}

/** A rebound text with `maxFontSize` refitted to its new font; `out` itself otherwise. */
function refit(out: Obj, item: Obj, key: string, state: Obj, ctx: RebindContext): Obj {
  if (out === item || key !== 'additionalTexts' || !ctx.fitText) return out;
  if (typeof out['maxFontSize'] !== 'number') return out;
  const size = ctx.fitText(out, state);
  return size === null || size === out['fontSize'] ? out : { ...out, fontSize: size };
}

function schemeOf(state: Obj, brand: BrandPack): Scheme | null {
  const id = state['brandScheme'];
  if (typeof id !== 'string' || !(SCHEME_IDS as readonly string[]).includes(id)) return null;
  return resolveScheme(brand, id as SchemeId);
}

/**
 * Brings every bound field of a page up to date with the brand. A field whose
 * value no longer matches its binding was edited by hand: it keeps its value
 * and loses the binding. Copies only what changed; returns `state` itself when
 * nothing is bound or the page already carries the brand's stamp.
 *
 * The stamp identifies the brand, not the bindings: a binding added while the
 * stamp is current is not resolved until the brand changes, so callers set the
 * field and the binding value together.
 */
export function rebindPageState(
  state: Readonly<Record<string, unknown>>,
  ctx: RebindContext
): { state: Record<string, unknown>; changed: boolean } {
  const { brand } = ctx;
  const stamp = brandFingerprint(brand);
  const someObject = (test: (obj: Obj) => boolean) =>
    test(state) ||
    Object.values(state).some((v) =>
      Array.isArray(v)
        ? v.some((x) => isPlainObject(x) && test(x))
        : isPlainObject(v) && Object.values(v).some((x) => isPlainObject(x) && test(x))
    );
  const current = state['brandStamp'] === stamp;
  // A logo still waiting for its fit keeps the page open even under a current stamp.
  if (current ? !someObject(hasPendingFit) : !someObject(hasBindings))
    return { state: state as Obj, changed: false };

  const scheme = schemeOf(state, brand);
  let next: Obj = rebindObject(state, ctx, scheme);
  for (const [key, value] of Object.entries(state)) {
    if (key === 'bind') continue;
    let replaced: unknown = value;
    if (Array.isArray(value)) {
      let items: unknown[] | null = null;
      value.forEach((item, i) => {
        if (!isPlainObject(item)) return;
        const out = refit(rebindObject(item, ctx, scheme), item, key, state, ctx);
        if (out !== item) (items ??= [...value])[i] = out;
      });
      if (items) replaced = items;
    } else if (isPlainObject(value)) {
      let record: Obj | null = null;
      for (const [id, item] of Object.entries(value)) {
        if (!isPlainObject(item)) continue;
        const out = rebindObject(item, ctx, scheme);
        if (out !== item) (record ??= { ...value })[id] = out;
      }
      if (record) replaced = record;
    }
    if (replaced !== value) {
      if (next === state) next = { ...state };
      next[key] = replaced;
    }
  }
  if (current && next === state) return { state: state as Obj, changed: false };
  if (next === state) next = { ...state };
  next['brandStamp'] = stamp;
  return { state: next, changed: true };
}

export function rebindPages<P extends { state: Record<string, unknown> }>(
  pages: readonly P[],
  ctx: RebindContext
): { pages: P[]; changed: boolean } {
  let changed = false;
  const out = pages.map((page) => {
    const r = rebindPageState(page.state, ctx);
    if (!r.changed) return page;
    changed = true;
    return { ...page, state: r.state };
  });
  return { pages: out, changed };
}
