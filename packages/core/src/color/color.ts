// SPDX-License-Identifier: MPL-2.0

/** An sRGB colour: r, g, b in 0–255, a in 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL_PATTERN = /^rgba?\((.*)\)$/i;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Parses `#rgb`, `#rrggbb` or `#rrggbbaa`, and `rgb()`/`rgba()` with commas or spaces. Null otherwise. */
export function parseColor(input: string): Rgba | null {
  const text = input.trim();

  const hex = HEX_PATTERN.exec(text);
  if (hex) {
    const digits = hex[1] ?? '';
    if (digits.length === 3) {
      // Each short digit doubles: #abc is #aabbcc.
      const channel = (at: number) => parseInt(digits.slice(at, at + 1).repeat(2), 16);
      return { r: channel(0), g: channel(1), b: channel(2), a: 1 };
    }
    const alpha = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: alpha,
    };
  }

  const functional = FUNCTIONAL_PATTERN.exec(text);
  if (functional) {
    const parts = (functional[1] ?? '').split(/[\s,/]+/).filter(Boolean);
    if (parts.length !== 3 && parts.length !== 4) return null;
    const numbers = parts.map(Number);
    if (!numbers.every((value) => Number.isFinite(value))) return null;
    const [r = 0, g = 0, b = 0, alpha = 1] = numbers;
    return {
      r: Math.round(clamp(r, 0, 255)),
      g: Math.round(clamp(g, 0, 255)),
      b: Math.round(clamp(b, 0, 255)),
      a: clamp(alpha, 0, 1),
    };
  }

  return null;
}

/** Lower-case `#rrggbb`, or `#rrggbbaa` when the colour is not opaque. */
export function toHex(c: Rgba): string {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  const base = `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`;
  return c.a < 1 ? base + channel(c.a * 255) : base;
}

/** The hex form of a parseable colour; the trimmed input otherwise (e.g. a named colour). */
export function normalizeColor(input: string): string {
  const parsed = parseColor(input);
  return parsed ? toHex(parsed) : input.trim();
}

/** WCAG 2.x relative luminance. Alpha is ignored. */
export function relativeLuminance(c: Rgba): number {
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

/** WCAG contrast ratio between two colours, 1–21. Null if either is unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const first = parseColor(a);
  const second = parseColor(b);
  if (!first || !second) return null;
  const luminances = [relativeLuminance(first), relativeLuminance(second)];
  const lighter = Math.max(...luminances);
  const darker = Math.min(...luminances);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Mixes two colours per channel in sRGB: t=0 gives `a`, t=1 gives `b`. Null if either is unparseable. */
export function mixColors(a: string, b: string, t: number): string | null {
  const from = parseColor(a);
  const to = parseColor(b);
  if (!from || !to) return null;
  const ratio = clamp(t, 0, 1);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * ratio);
  return toHex({
    r: mix(from.r, to.r),
    g: mix(from.g, to.g),
    b: mix(from.b, to.b),
    a: from.a + (to.a - from.a) * ratio,
  });
}
