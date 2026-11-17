// SPDX-License-Identifier: AGPL-3.0-only
import { contrastRatio, mixColors, parseColor, toHex } from '../color/color.js';
import { brandDefault } from './brandDefault.js';
import { type BrandBackground, type BrandColors } from './brandPack.js';
import { deriveSchemes, type SchemeId } from './schemes.js';

/** The three colours a person chooses; every other role is derived. */
export interface BrandColorInputs {
  primary: string;
  secondary: string;
  accent: string;
}

// The same thresholds as `schemes.ts`.
const TEXT_CONTRAST = 4.5;
const ACCENT_CONTRAST = 3.0;
/** Body text on the surface; stricter than the minimum, as the default pack is. */
const BODY_CONTRAST = 7.0;

const WHITE = '#ffffff';
const BLACK = '#000000';
const PAPER = '#f6f4ef';
/** How far a tint of the primary goes towards white; widened in steps when it is not enough. */
const SURFACE_TINTS = [0.94, 0.96, 0.98, 1];
const STEP = 0.05;
/** Attention candidates, best first; the last resort is darkened until it reads. */
const ATTENTION = ['#d62839', '#b3261e', '#c2410c'];
/** Minimum RGB distance (0–441) between the attention colour and each input. */
const ATTENTION_DISTANCE = 60;

const contrast = (a: string, b: string) => contrastRatio(a, b) ?? 0;

/** Lower-case `#rrggbb` (alpha dropped), or null when the input is not a colour. */
function hex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const parsed = parseColor(input);
  return parsed ? toHex({ ...parsed, a: 1 }) : null;
}

function distance(a: string, b: string): number {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return 0;
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
}

/** Mixes `color` towards black in 0.05 steps until it reaches `min` on `ground`; black at worst. */
function darkenUntil(color: string, ground: string, min: number): string {
  for (let t = 0; t <= 1; t += STEP) {
    const mixed = mixColors(color, BLACK, t);
    if (mixed !== null && contrast(mixed, ground) >= min) return mixed;
  }
  return BLACK;
}

function inputsOf(input: unknown): BrandColorInputs | null {
  if (typeof input !== 'object' || input === null) return null;
  const given = input as Record<string, unknown>;
  const primary = hex(given['primary']);
  const secondary = hex(given['secondary']);
  const accent = hex(given['accent']);
  return primary && secondary && accent ? { primary, secondary, accent } : null;
}

/**
 * All eight brand roles from the three a person picks. A very light tint of
 * the primary is the surface; text, accent on light and attention are chosen
 * so each reaches its contrast on the role it sits on (4.5:1 text, 3:1
 * accent). Pure and deterministic; null when any input is not a colour.
 */
export function deriveBrandColors(input: BrandColorInputs): BrandColors | null {
  const inputs = inputsOf(input);
  if (!inputs) return null;
  const { primary, secondary, accent } = inputs;

  // The textOnLight below reaches 7:1 on the tint, or turns black.
  let surface: string | null = null;
  for (const t of SURFACE_TINTS) {
    const tint = mixColors(primary, WHITE, t);
    if (
      tint !== null &&
      contrast(darkenUntil(primary, tint, BODY_CONTRAST), tint) >= BODY_CONTRAST
    ) {
      surface = tint;
      break;
    }
  }
  surface ??= PAPER;

  const textOnLight = darkenUntil(primary, surface, BODY_CONTRAST);
  const textOnDark = [WHITE, textOnLight, BLACK].reduce((best, candidate) =>
    contrast(candidate, primary) > contrast(best, primary) &&
    contrast(best, primary) < TEXT_CONTRAST
      ? candidate
      : best
  );
  const accentOnLight =
    contrast(accent, surface) >= ACCENT_CONTRAST
      ? accent
      : darkenUntil(accent, surface, TEXT_CONTRAST);

  const reads = (candidate: string) => contrast(candidate, surface) >= TEXT_CONTRAST;
  const gap = (candidate: string) =>
    Math.min(...[primary, secondary, accent].map((own) => distance(candidate, own)));
  // The first candidate clear of every input; when all clash, the one furthest from them.
  const readable = ATTENTION.filter(reads);
  const attention =
    readable.find((candidate) => gap(candidate) >= ATTENTION_DISTANCE) ??
    readable.reduce<string | null>(
      (far, candidate) => (far === null || gap(candidate) > gap(far) ? candidate : far),
      null
    ) ??
    darkenUntil(ATTENTION[0] ?? BLACK, surface, TEXT_CONTRAST);

  return { primary, secondary, accent, accentOnLight, attention, textOnDark, textOnLight, surface };
}

const GROUNDS: { scheme: SchemeId; label: string }[] = [
  { scheme: 'primary', label: 'Primary' },
  { scheme: 'secondary', label: 'Secondary' },
  { scheme: 'light', label: 'Light' },
  { scheme: 'dark', label: 'Dark' },
];

/**
 * The solid grounds a brand offers, from its colour worlds: primary,
 * secondary, light and dark, each with the ink that reads on it. A world whose
 * ground sits within 1.2:1 of an earlier one is left out. Empty on bad input.
 */
export function deriveGrounds(input: BrandColorInputs): BrandBackground[] {
  const colors = deriveBrandColors(input);
  if (!colors) return [];
  const schemes = deriveSchemes({ ...brandDefault, colors });
  return GROUNDS.flatMap(({ scheme, label }) => {
    const found = schemes.find((s) => s.id === scheme);
    return found ? [{ id: scheme, label, color: found.roles.ground, ink: found.roles.ink }] : [];
  });
}
