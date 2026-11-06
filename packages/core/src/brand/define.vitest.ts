// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../color/color.js';
import { resolveRef } from './bindings.js';
import { defineBrand, type BrandInputs } from './define.js';
import { deriveBrandColors, deriveGrounds } from './derive.js';

const c = (a: string, b: string) => contrastRatio(a, b) ?? 0;

const inputs: BrandInputs = {
  id: 'riverside',
  name: 'Riverside',
  colors: { primary: '#0f2352', secondary: '#1b3fae', accent: '#f5822a' },
  fonts: { headline: 'Anton', body: 'Instrument Sans', cuts: { Anton: { bold: false } } },
};

describe('defineBrand', () => {
  it('derives the colour roles and the grounds', () => {
    const brand = defineBrand(inputs);
    expect(brand.colors).toEqual(deriveBrandColors(inputs.colors));
    expect(brand.backgrounds).toEqual(deriveGrounds(inputs.colors));
    expect(brand.backgrounds.map((g) => g.color)).toContain(brand.defaultBackground);
    for (const ground of brand.backgrounds) {
      expect(c(ground.ink, ground.color), ground.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('binds every role swatch to its role, so a picked swatch follows the brand', () => {
    const brand = defineBrand(inputs);
    for (const swatch of [...brand.palette, ...brand.textPalette, ...brand.markers.swatches]) {
      if (swatch.ref) expect(resolveRef(swatch.ref, brand, null), swatch.id).toBe(swatch.color);
    }
    expect(brand.palette.filter((s) => s.ref).map((s) => s.ref)).toEqual([
      'brand.primary',
      'brand.secondary',
      'brand.accent',
      'brand.accentOnLight',
      'brand.attention',
      'brand.surface',
    ]);
  });

  it('keeps swatch ids unique within each picker, since documents store them', () => {
    const brand = defineBrand(inputs);
    for (const swatches of [brand.palette, brand.textPalette, brand.markers.swatches]) {
      const ids = swatches.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('falls the quote fonts back to the headline and the serif, and keeps the cuts', () => {
    expect(defineBrand(inputs).fonts).toEqual({
      headline: 'Anton',
      body: 'Instrument Sans',
      quoteShort: 'Anton',
      quoteEmphasis: 'Anton',
      cuts: { Anton: { bold: false } },
    });
    const serif = defineBrand({ ...inputs, fonts: { ...inputs.fonts, serif: 'Fraunces' } });
    expect(serif.fonts.quoteEmphasis).toBe('Fraunces');
    const own = defineBrand({ ...inputs, fonts: { ...inputs.fonts, quoteShort: 'Raleway' } });
    expect(own.fonts.quoteShort).toBe('Raleway');
  });

  it('takes the logo, layout and font files as given, and nothing when they are absent', () => {
    const plain = defineBrand(inputs);
    expect(plain.logo).toBeNull();
    expect(plain.fontFaces).toEqual([]);
    expect(plain).not.toHaveProperty('logoAlt');
    expect(plain).not.toHaveProperty('layout');
    expect(plain.lineHeightFactor).toBe(1.1);

    const logo = { src: 'logo.svg', label: 'Riverside' };
    const face = { family: 'Anton', src: 'anton.woff2' };
    const full = defineBrand({ ...inputs, logo, fontFaces: [face], lineHeightFactor: 1.2 });
    expect(full.logo).toEqual(logo);
    expect(full.fontFaces).toEqual([face]);
    expect(full.lineHeightFactor).toBe(1.2);
  });

  it('refuses a colour that is not a colour', () => {
    expect(() =>
      defineBrand({ ...inputs, colors: { ...inputs.colors, accent: 'orange-ish' } })
    ).toThrow(/riverside/);
  });
});

describe('defineBrand print.cmyk', () => {
  it('has no print block without an input', () => {
    expect(defineBrand(inputs).print).toBeUndefined();
    expect(defineBrand({ ...inputs, print: {} }).print).toBeUndefined();
  });

  it('passes the map to the pack with its keys as lower-case #rrggbb', () => {
    const brand = defineBrand({
      ...inputs,
      print: {
        cmyk: {
          '#0F2352': [100, 90, 30, 40],
          '#f80': [0, 50, 100, 0],
          '#ffffff80': [0, 0, 0, 0],
        },
      },
    });
    expect(brand.print).toEqual({
      cmyk: {
        '#0f2352': [100, 90, 30, 40],
        '#ff8800': [0, 50, 100, 0],
        '#ffffff': [0, 0, 0, 0],
      },
    });
  });

  it.each([
    ['a key that is not hex', { red: [0, 100, 100, 0] }],
    ['a key without the hash', { '0f2352': [0, 0, 0, 0] }],
    ['three numbers', { '#0f2352': [1, 2, 3] }],
    ['five numbers', { '#0f2352': [1, 2, 3, 4, 5] }],
    ['a value above 100', { '#0f2352': [0, 0, 0, 101] }],
    ['a negative value', { '#0f2352': [-1, 0, 0, 0] }],
    ['NaN', { '#0f2352': [Number.NaN, 0, 0, 0] }],
    ['a string for a number', { '#0f2352': ['1', 0, 0, 0] }],
    ['one colour twice with different values', { '#fff': [0, 0, 0, 0], '#FFFFFF': [0, 0, 0, 1] }],
  ])('throws for %s', (_label, cmyk) => {
    expect(() => defineBrand({ ...inputs, print: { cmyk: cmyk as never } })).toThrow(/print\.cmyk/);
  });
});
