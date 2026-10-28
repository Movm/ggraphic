// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../color/color.js';
import { brandDefault } from './brandDefault.js';
import { deriveBrandColors, deriveGrounds } from './derive.js';

const c = (a: string, b: string) => contrastRatio(a, b) ?? 0;

interface Triple {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
}

// The 11 prototype brands: the ground is the primary, the "duo-low" shade stands in for the
// secondary, the accent is the accent.
const PROTOTYPES: Triple[] = [
  { name: 'studio', primary: '#6b1632', secondary: '#4a0e22', accent: '#ff7ab6' },
  { name: 'red', primary: '#d62839', secondary: '#6b0f1b', accent: '#ffffff' },
  { name: 'forest', primary: '#11402c', secondary: '#0a2a1c', accent: '#cbef4d' },
  { name: 'neon', primary: '#0b0b0c', secondary: '#000000', accent: '#ff3fa4' },
  { name: 'yellow', primary: '#ffd93b', secondary: '#121212', accent: '#121212' },
  { name: 'blue', primary: '#1b3fae', secondary: '#10246b', accent: '#ffcb2e' },
  { name: 'pastel', primary: '#f8d3e1', secondary: '#123a2c', accent: '#17794a' },
  { name: 'violet', primary: '#5a2088', secondary: '#4e1c7c', accent: '#ffd98a' },
  { name: 'paper', primary: '#f1e9da', secondary: '#1e2b25', accent: '#c8175a' },
  { name: 'photo', primary: '#0d0c11', secondary: '#0d0c11', accent: '#ff8fc0' },
  { name: 'night', primary: '#0f2352', secondary: '#0f2352', accent: '#f5822a' },
];

const EXTREMES: Triple[] = [
  { name: 'default', ...pick(brandDefault.colors) },
  { name: 'yellow', primary: '#ffe600', secondary: '#fff200', accent: '#fff700' },
  { name: 'near-white', primary: '#fafafa', secondary: '#ffffff', accent: '#fdfdfd' },
  { name: 'near-black', primary: '#050505', secondary: '#000000', accent: '#0a0a0a' },
  { name: 'primary equals secondary', primary: '#1d3557', secondary: '#1d3557', accent: '#f4c542' },
  { name: 'all equal', primary: '#777777', secondary: '#777777', accent: '#777777' },
  { name: 'red lookalike', primary: '#d62839', secondary: '#c2410c', accent: '#b3261e' },
  { name: 'pure white', primary: '#ffffff', secondary: '#ffffff', accent: '#ffffff' },
  { name: 'pure black', primary: '#000000', secondary: '#000000', accent: '#000000' },
];

function pick(x: { primary: string; secondary: string; accent: string }) {
  return { primary: x.primary, secondary: x.secondary, accent: x.accent };
}

const cases = [...EXTREMES, ...PROTOTYPES];

describe('deriveBrandColors', () => {
  it('covers the 11 prototype brands', () => {
    expect(PROTOTYPES).toHaveLength(11);
  });

  it.each(cases)('meets the contrast thresholds for $name', (t) => {
    const colors = deriveBrandColors(t);
    expect(colors).not.toBeNull();
    const d = colors!;
    expect(c(d.textOnDark, d.primary)).toBeGreaterThanOrEqual(4.5);
    expect(c(d.textOnLight, d.surface)).toBeGreaterThanOrEqual(4.5);
    expect(c(d.accentOnLight, d.surface)).toBeGreaterThanOrEqual(3);
    expect(c(d.attention, d.surface)).toBeGreaterThanOrEqual(4.5);
    for (const key of Object.keys(d) as (keyof typeof d)[]) {
      expect(d[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps the three inputs as given (normalised to lower-case hex)', () => {
    const d = deriveBrandColors({
      primary: '#ABC',
      secondary: 'rgb(10, 20, 30)',
      accent: '#FFE600',
    });
    expect([d?.primary, d?.secondary, d?.accent]).toEqual(['#aabbcc', '#0a141e', '#ffe600']);
  });

  it('uses white text on a dark primary and dark text on a light one', () => {
    expect(
      deriveBrandColors({ primary: '#1d3557', secondary: '#457b9d', accent: '#f4c542' })?.textOnDark
    ).toBe('#ffffff');
    const light = deriveBrandColors({
      primary: '#ffe600',
      secondary: '#457b9d',
      accent: '#1d3557',
    });
    expect(light?.textOnDark).not.toBe('#ffffff');
  });

  it('keeps the accent when it already reads on the surface, darkens it otherwise', () => {
    const strong = deriveBrandColors({
      primary: '#1d3557',
      secondary: '#457b9d',
      accent: '#b5470f',
    });
    expect(strong?.accentOnLight).toBe('#b5470f');
    const weak = deriveBrandColors({ primary: '#1d3557', secondary: '#457b9d', accent: '#f4c542' });
    expect(weak?.accentOnLight).not.toBe('#f4c542');
  });

  it('picks an attention colour that is not one of the inputs', () => {
    const d = deriveBrandColors({ primary: '#d62839', secondary: '#1d3557', accent: '#b3261e' });
    expect(d?.attention).not.toBe('#d62839');
    expect(d?.attention).not.toBe('#b3261e');
  });

  it('returns null, never throws, on malformed input', () => {
    const bad: unknown[] = [
      { primary: 'nope', secondary: '#fff', accent: '#fff' },
      { primary: '#fff', secondary: '', accent: '#fff' },
      { primary: '#fff', secondary: '#fff' },
      { primary: 12, secondary: null, accent: {} },
      {},
      null,
      undefined,
      'x',
      42,
    ];
    for (const input of bad) {
      expect(() => deriveBrandColors(input as never)).not.toThrow();
      expect(deriveBrandColors(input as never)).toBeNull();
      expect(() => deriveGrounds(input as never)).not.toThrow();
      expect(deriveGrounds(input as never)).toEqual([]);
    }
  });

  it('never yields NaN', () => {
    for (const t of cases) {
      expect(JSON.stringify(deriveBrandColors(t))).not.toMatch(/NaN|undefined|null/);
    }
  });

  it('is deterministic', () => {
    for (const t of cases) {
      expect(deriveBrandColors(t)).toEqual(deriveBrandColors({ ...t }));
      expect(deriveGrounds(t)).toEqual(deriveGrounds({ ...t }));
    }
  });
});

describe('deriveGrounds', () => {
  it('offers primary, secondary, light and dark with a readable ink', () => {
    const grounds = deriveGrounds({ primary: '#1d3557', secondary: '#f4c542', accent: '#b5470f' });
    expect(grounds.map((g) => g.id)).toEqual(['primary', 'secondary', 'light', 'dark']);
    for (const g of grounds) expect(c(g.ink, g.color)).toBeGreaterThanOrEqual(4.5);
  });

  it('drops a ground within 1.2:1 of an earlier one', () => {
    const grounds = deriveGrounds({ primary: '#1d3557', secondary: '#1d3557', accent: '#f4c542' });
    expect(grounds.map((g) => g.id)).not.toContain('secondary');
  });

  it.each(cases)('keeps readable ink on every ground for $name', (t) => {
    const grounds = deriveGrounds(t);
    expect(grounds.length).toBeGreaterThan(0);
    for (const g of grounds) expect(c(g.ink, g.color)).toBeGreaterThanOrEqual(4.5);
  });
});
