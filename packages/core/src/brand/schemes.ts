// SPDX-License-Identifier: MPL-2.0
import { contrastRatio, mixColors, parseColor, relativeLuminance, toHex } from '../color/color.js';
import { type BrandPack } from './brandPack.js';

/** The colours a design element can bind to, resolved per colour world. */
export const SURFACE_ROLES = [
  'ground',
  'ink',
  'ink2',
  'accent',
  'on-accent',
  'deep',
  'shade',
  'marker',
  'marker-ink',
  'duo-low',
  'duo-high',
] as const;
export type SurfaceRole = (typeof SURFACE_ROLES)[number];

/** The colour worlds a brand yields, in the order they are offered. */
export const SCHEME_IDS = ['primary', 'secondary', 'light', 'dark', 'photo'] as const;
export type SchemeId = (typeof SCHEME_IDS)[number];

export interface Scheme {
  id: SchemeId;
  /** Lower-case hex per role. */
  roles: Readonly<Record<SurfaceRole, string>>;
  /** Roles whose brand colour was too weak and which hold a substitute instead. */
  fallbacks: readonly SurfaceRole[];
}

const WHITE = '#ffffff';
const BLACK = '#000000';
const TEXT_CONTRAST = 4.5;
const ACCENT_CONTRAST = 3.0;
const DISTINCT_GROUND = 1.2;

function luminance(hex: string): number {
  const rgba = parseColor(hex);
  return rgba ? relativeLuminance(rgba) : 0;
}

function contrast(a: string, b: string): number {
  return contrastRatio(a, b) ?? 0;
}

/** The better of white and black on `ground`. */
function whiteOrBlack(ground: string): string {
  return contrast(WHITE, ground) >= contrast(BLACK, ground) ? WHITE : BLACK;
}

/** The first of `candidates` (best first) that reaches `min` on `ground`, else null. */
function bestOf(candidates: string[], ground: string, min: number): string | null {
  let best: string | null = null;
  for (const c of candidates) {
    if (best === null || contrast(c, ground) > contrast(best, ground)) best = c;
  }
  return best !== null && contrast(best, ground) >= min ? best : null;
}

/** Canonical hex, or null when the colour cannot be parsed. */
function norm(color: string): string | null {
  const parsed = parseColor(color);
  return parsed ? toHex(parsed) : null;
}

function buildScheme(brand: BrandPack, id: SchemeId, ground: string): Scheme {
  const c = brand.colors;
  const fallbacks: SurfaceRole[] = [];
  const text = [norm(c.textOnDark), norm(c.textOnLight)].filter((x): x is string => x !== null);

  let ink = bestOf(text, ground, TEXT_CONTRAST);
  if (ink === null) {
    ink = whiteOrBlack(ground);
    fallbacks.push('ink');
  }

  let ink2 = mixColors(ink, ground, 0.3);
  if (ink2 === null || contrast(ink2, ground) < TEXT_CONTRAST) {
    ink2 = ink;
    fallbacks.push('ink2');
  }

  const darkGround = luminance(ink) > luminance(ground);
  const accentOrder = darkGround
    ? [c.accent, c.accentOnLight, c.attention]
    : [c.accentOnLight, c.accent, c.attention, c.primary];
  let accent: string | null = null;
  for (const candidate of accentOrder) {
    const n = norm(candidate);
    if (n !== null && contrast(n, ground) >= ACCENT_CONTRAST) {
      accent = n;
      break;
    }
  }
  // An accent that lands on the ink colour (e.g. `primary` as last candidate) is no accent at all.
  if (accent === null || accent === ink) {
    accent = ink;
    fallbacks.push('accent');
  }

  let onAccent = bestOf(text, accent, TEXT_CONTRAST);
  if (onAccent === null) {
    onAccent = whiteOrBlack(accent);
    fallbacks.push('on-accent');
  }

  let deep = mixColors(ground, BLACK, 0.2);
  if (deep === null) {
    deep = ground;
    fallbacks.push('deep');
  }

  const swatches = brand.markers.swatches
    .map((s) => norm(s.color))
    .filter((x): x is string => x !== null);
  const markerInk = norm(brand.markers.ink);
  let marker =
    markerInk === null ? undefined : swatches.find((s) => contrast(markerInk, s) >= TEXT_CONTRAST);
  let markerInkOut = markerInk ?? WHITE;
  if (marker === undefined) {
    marker = swatches[0] ?? accent;
    markerInkOut = whiteOrBlack(marker);
    fallbacks.push('marker', 'marker-ink');
  }

  let duoLow = mixColors(c.primary, BLACK, 0.5);
  if (duoLow === null) {
    duoLow = ink;
    fallbacks.push('duo-low');
  }
  let duoHigh = norm(c.surface);
  if (duoHigh === null) {
    duoHigh = ink;
    fallbacks.push('duo-high');
  }

  return {
    id,
    roles: {
      ground,
      ink,
      ink2,
      accent,
      'on-accent': onAccent,
      deep,
      shade: BLACK,
      marker,
      'marker-ink': markerInkOut,
      'duo-low': duoLow,
      'duo-high': duoHigh,
    },
    fallbacks,
  };
}

/**
 * The colour worlds of a brand, in `SCHEME_IDS` order. A world whose ground
 * cannot be parsed, or sits within 1.2:1 of an earlier ground, is left out;
 * `photo` always stays, its ground stands for a shaded photo. Never throws.
 */
function groundsOf(brand: BrandPack): Record<SchemeId, string | null> {
  return {
    primary: norm(brand.colors.primary),
    secondary: norm(brand.colors.secondary),
    light: norm(brand.colors.surface),
    dark: mixColors(brand.colors.primary, BLACK, 0.7),
    photo: BLACK,
  };
}

export function deriveSchemes(brand: BrandPack): Scheme[] {
  const grounds = groundsOf(brand);
  const schemes: Scheme[] = [];
  const kept: string[] = [];
  for (const id of SCHEME_IDS) {
    const ground = grounds[id];
    if (ground === null) continue;
    if (id !== 'photo' && kept.some((k) => contrast(k, ground) < DISTINCT_GROUND)) continue;
    kept.push(ground);
    schemes.push(buildScheme(brand, id, ground));
  }
  return schemes;
}

export function schemeById(brand: BrandPack, id: SchemeId): Scheme | null {
  return deriveSchemes(brand).find((s) => s.id === id) ?? null;
}

/**
 * The world a page of `id` is drawn in. A world the brand left out (its ground
 * sat within 1.2:1 of an earlier one) resolves to the kept world whose ground
 * absorbed it, so a page keeps its look; the first world when none can be told.
 * Null only when the brand yields no world at all.
 */
export function resolveScheme(brand: BrandPack, id: SchemeId): Scheme | null {
  const schemes = deriveSchemes(brand);
  const exact = schemes.find((s) => s.id === id);
  if (exact) return exact;
  const dropped = groundsOf(brand)[id];
  if (dropped === null) return schemes[0] ?? null;
  let nearest: Scheme | null = null;
  let lowest = Infinity;
  for (const s of schemes) {
    const c = contrast(s.roles.ground, dropped);
    if (c < DISTINCT_GROUND && c < lowest) {
      lowest = c;
      nearest = s;
    }
  }
  return nearest ?? schemes[0] ?? null;
}
