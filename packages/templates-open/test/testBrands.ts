// SPDX-License-Identifier: CC0-1.0
import { brandDefault, parseColor, relativeLuminance, type BrandPack } from '@ggraphic/core';

import testBrands from './test-brands.json' with { type: 'json' };

const luminance = (hex: string): number => {
  const rgba = parseColor(hex);
  if (!rgba) throw new Error(`not a colour: ${hex}`);
  return relativeLuminance(rgba);
};

/** [lighter, darker] of two colours by relative luminance. */
const lighterDarker = (a: string, b: string): [string, string] =>
  luminance(a) >= luminance(b) ? [a, b] : [b, a];

/**
 * `brandDefault` plus one pack per test brand. The colours come from the roles:
 * primary = ground, secondary = deep, accent = accentOnLight = attention = accent,
 * textOnDark / textOnLight = the lighter / darker of ink and on-accent,
 * surface = the lighter of ink and duo-high.
 */
export function testBrandPacks(): BrandPack[] {
  const packs = testBrands.brands.map(({ id, roles }): BrandPack => {
    const [textOnDark, textOnLight] = lighterDarker(roles.ink, roles['on-accent']);
    const [surface] = lighterDarker(roles.ink, roles['duo-high']);
    return {
      ...brandDefault,
      id: `test-${id}`,
      name: id,
      logo: null,
      colors: {
        primary: roles.ground,
        secondary: roles.deep,
        accent: roles.accent,
        accentOnLight: roles.accent,
        attention: roles.accent,
        textOnDark,
        textOnLight,
        surface,
      },
    };
  });
  return [brandDefault, ...packs];
}
