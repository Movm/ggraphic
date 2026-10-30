// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../color/color.js';
import { brandDefault } from './brandDefault.js';
import { type BrandPack } from './brandPack.js';
import { deriveSchemes, resolveScheme, type SchemeId } from './schemes.js';

function withColors(colors: Partial<BrandPack['colors']>): BrandPack {
  return { ...brandDefault, colors: { ...brandDefault.colors, ...colors } };
}

const brands: [string, BrandPack][] = [
  ['default', brandDefault],
  ['accent "red"', withColors({ accent: 'red' })],
  ['accent "#abc"', withColors({ accent: '#abc' })],
  ['accent "rgb(0 0 0)"', withColors({ accent: 'rgb(0 0 0)' })],
  ['unparseable textOnDark', withColors({ textOnDark: 'banana' })],
  ['unparseable textOnLight', withColors({ textOnLight: 'banana' })],
  ['yellow primary', withColors({ primary: '#FFE600' })],
  ['primary equals secondary', withColors({ secondary: brandDefault.colors.primary })],
  ['near-white secondary', withColors({ secondary: '#FAFAFA' })],
  ['mid-grey primary', withColors({ primary: '#777777' })],
];

describe('accent world', () => {
  it('has the brand accent as ground and a readable ink', () => {
    const ids = deriveSchemes(brandDefault).map((x) => x.id);
    expect(ids).toEqual(['primary', 'secondary', 'accent', 'light', 'dark', 'photo']);
    const accent = deriveSchemes(brandDefault).find((x) => x.id === 'accent')!;
    expect(accent.roles.ground).toBe(brandDefault.colors.accent.toLowerCase());
    expect(contrastRatio(accent.roles.ink, accent.roles.ground)).toBeGreaterThanOrEqual(4.5);
  });

  it('is dropped when its ground sits within 1.2:1 of an earlier one', () => {
    const brand = withColors({ accent: brandDefault.colors.primary });
    expect(deriveSchemes(brand).map((x) => x.id)).not.toContain('accent');
  });
});

describe('deriveSchemes', () => {
  it("the default brand reproduces today's seed colours", () => {
    const by = (id: SchemeId) => deriveSchemes(brandDefault).find((x) => x.id === id)!.roles;
    const s = { primary: by('primary'), secondary: by('secondary'), light: by('light') };
    expect([s.primary.ground, s.primary.ink, s.primary.accent]).toEqual([
      '#1d3557',
      '#ffffff',
      '#f4c542',
    ]);
    expect([s.light.ground, s.light.ink, s.light.accent]).toEqual([
      '#f6f4ef',
      '#1d3557',
      '#b5470f',
    ]);
    // #f4c542 on #457b9d is 2.82:1, below 3.0, so accent falls back to ink
    expect([s.secondary.ground, s.secondary.ink, s.secondary.accent]).toEqual([
      '#457b9d',
      '#ffffff',
      '#ffffff',
    ]);
    expect(deriveSchemes(brandDefault).find((x) => x.id === 'secondary')!.fallbacks).toContain(
      'accent'
    );
  });

  it.each(brands)('ink is readable on every ground: %s', (_name, brand) => {
    for (const scheme of deriveSchemes(brand)) {
      expect(contrastRatio(scheme.roles.ink, scheme.roles.ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(brands)('does not throw and yields parseable roles: %s', (_name, brand) => {
    const schemes = deriveSchemes(brand);
    expect(schemes.length).toBeGreaterThan(0);
    for (const scheme of schemes) {
      for (const role of Object.values(scheme.roles)) {
        expect(role).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(Number.isNaN(contrastRatio(scheme.roles.ink, scheme.roles.ground))).toBe(false);
    }
  });

  it.each(brands)('ink2 is readable or equals ink: %s', (_name, brand) => {
    for (const scheme of deriveSchemes(brand)) {
      expect(contrastRatio(scheme.roles.ink2, scheme.roles.ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('accent falls back to ink and says so', () => {
    const light = deriveSchemes(
      withColors({ accent: '#E6D200', accentOnLight: '#E6D200', attention: '#E6D200' })
    ).find((x) => x.id === 'light')!;
    expect(light.roles.accent).toBe(light.roles.ink);
    expect(light.fallbacks).toContain('accent');
  });

  it('duplicate grounds give one scheme', () => {
    const ids = deriveSchemes(withColors({ secondary: brandDefault.colors.primary })).map(
      (x) => x.id
    );
    expect(ids).not.toContain('secondary');
    expect(ids).toContain('primary');
  });

  it('photo survives dedupe', () => {
    expect(deriveSchemes(brandDefault).map((x) => x.id)).toContain('photo');
  });

  it('malformed brand colours do not throw', () => {
    const schemes = deriveSchemes(withColors({ accent: 'banana' }));
    expect(schemes.length).toBeGreaterThan(0);
    const primary = schemes.find((x) => x.id === 'primary')!;
    expect(primary.roles.accent).not.toBe('banana');
    expect(primary.fallbacks).toContain('accent');
    expect(() => deriveSchemes(withColors({ primary: 'nope', surface: '??' }))).not.toThrow();
  });

  it('deterministic', () => {
    expect(deriveSchemes(brandDefault)).toEqual(deriveSchemes(brandDefault));
  });
});

describe('resolveScheme', () => {
  const near = withColors({ secondary: '#FAFAFA' });

  it('returns the world itself when the brand has it', () => {
    expect(resolveScheme(brandDefault, 'light')).toEqual(
      deriveSchemes(brandDefault).find((x) => x.id === 'light')
    );
  });

  it('a dark primary that drops dark resolves to primary, not photo', () => {
    const darkPrimary = withColors({ primary: '#101010' });
    const ids = deriveSchemes(darkPrimary).map((x) => x.id);
    expect(ids).not.toContain('dark');
    expect(ids).toContain('photo');
    expect(resolveScheme(darkPrimary, 'dark')?.id).toBe('primary');
  });

  it('returns the kept world that absorbed a deduplicated one', () => {
    expect(resolveScheme(near, 'light')?.id).toBe('secondary');
  });
});
