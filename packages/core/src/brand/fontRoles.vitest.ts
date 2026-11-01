// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { brandDefault } from './brandDefault.js';
import { type BrandPack } from './brandPack.js';
import { currentFontRole, fontRoleOptions } from './fontRoles.js';

/** An organisation brand as `build.ts` makes it: no serif, no condensed, quotes in the two main fonts. */
const orgBrand: BrandPack = {
  ...brandDefault,
  fonts: {
    headline: 'Raleway',
    body: 'Lora',
    quoteShort: 'Raleway',
    quoteEmphasis: 'Lora',
  },
};

describe('fontRoleOptions', () => {
  it('offers headline, body, condensed and serif of the default brand, in that order', () => {
    expect(fontRoleOptions(brandDefault)).toEqual([
      { role: 'headline', family: 'Bricolage Grotesque' },
      { role: 'body', family: 'Instrument Sans' },
      { role: 'condensed', family: 'Anton' },
      { role: 'serif', family: 'Fraunces' },
    ]);
  });

  it('does not offer a role twice when it collapses into an earlier one', () => {
    // serif falls back to quoteEmphasis (= body), condensed to headline.
    expect(fontRoleOptions(orgBrand)).toEqual([
      { role: 'headline', family: 'Raleway' },
      { role: 'body', family: 'Lora' },
    ]);
  });

  it('keeps a fallback role that has a family of its own', () => {
    const brand: BrandPack = {
      ...orgBrand,
      fonts: { ...orgBrand.fonts, quoteEmphasis: 'Playfair Display' },
    };
    expect(fontRoleOptions(brand).map((o) => o.role)).toEqual(['headline', 'body', 'serif']);
  });

  it('compares families without regard to case, quotes or padding', () => {
    const brand: BrandPack = {
      ...orgBrand,
      fonts: { ...orgBrand.fonts, condensed: ' "raleway" ' },
    };
    expect(fontRoleOptions(brand).map((o) => o.role)).toEqual(['headline', 'body']);
  });
});

describe('currentFontRole', () => {
  const options = fontRoleOptions(brandDefault);
  const text = (fontFamily: string, bind?: Record<string, { ref: string; value: string }>) =>
    ({ fontFamily, ...(bind ? { bind } : {}) }) as Parameters<typeof currentFontRole>[0];

  it('is the bound role', () => {
    expect(
      currentFontRole(
        text('Anton, Arial, sans-serif', { fontFamily: { ref: 'font.condensed', value: 'Anton' } }),
        options
      )
    ).toBe('condensed');
  });

  it('goes by the family when the text is not bound', () => {
    expect(currentFontRole(text('Instrument Sans, Arial, sans-serif'), options)).toBe('body');
    expect(currentFontRole(text('"fraunces", Georgia, serif'), options)).toBe('serif');
  });

  it('is null for a family no role stands for', () => {
    expect(currentFontRole(text('Comic Sans MS, cursive'), options)).toBeNull();
  });

  it('maps a bound quote role to the option with the same family', () => {
    const bound = (ref: string) =>
      text('Fraunces, Georgia, serif', { fontFamily: { ref, value: 'Fraunces' } });
    expect(currentFontRole(bound('font.quoteEmphasis'), options)).toBe('serif');
    const short = text('Bricolage Grotesque, Arial, sans-serif', {
      fontFamily: { ref: 'font.quoteShort', value: 'Bricolage Grotesque' },
    });
    expect(currentFontRole(short, options)).toBe('headline');
  });

  it('maps a bound role that collapsed away to the role that kept its family', () => {
    const collapsed = fontRoleOptions(orgBrand);
    const t = text('Raleway, Arial, sans-serif', {
      fontFamily: { ref: 'font.condensed', value: 'Raleway' },
    });
    expect(currentFontRole(t, collapsed)).toBe('headline');
  });

  it('ignores a binding on another field and a binding that is not a font', () => {
    expect(
      currentFontRole(
        text('Anton, Arial, sans-serif', { fill: { ref: 'brand.primary', value: '#000000' } }),
        options
      )
    ).toBe('condensed');
  });

  it('is null for a text without a font family', () => {
    expect(currentFontRole({ fontFamily: '' }, options)).toBeNull();
  });
});
