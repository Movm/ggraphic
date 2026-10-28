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
  ['yellow primary', withColors({ primary: '#FFE600' })],
  ['primary equals secondary', withColors({ secondary: brandDefault.colors.primary })],
  ['near-white secondary', withColors({ secondary: '#FAFAFA' })],
  ['mid-grey primary', withColors({ primary: '#777777' })],
];

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

  it.each(brands)('ink2 is readable or equals ink: %s', (_name, brand) => {
    for (const scheme of deriveSchemes(brand)) {
      expect(contrastRatio(scheme.roles.ink2, scheme.roles.ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('accent falls back to ink and says so', () => {
    const light = deriveSchemes(
      withColors({ accent: '#FFE600', accentOnLight: '#FFE600', attention: '#FFE600' })
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
