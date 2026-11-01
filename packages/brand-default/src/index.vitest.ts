// SPDX-License-Identifier: MPL-2.0
import { brandDefault } from '@ggraphic/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { defaultBrand } from './index.js';

describe('defaultBrand', () => {
  it('is brandDefault with the cuts of its families', () => {
    const { fonts, ...rest } = defaultBrand;
    const { fonts: coreFonts, ...coreRest } = brandDefault;
    expect(rest).toEqual(coreRest);
    expect({ ...fonts, cuts: undefined }).toEqual({ ...coreFonts, cuts: undefined });
  });

  it('loads a face for every cut it declares, and declares no cut it does not load', () => {
    const loaded = readFileSync(new URL('./fonts.ts', import.meta.url), 'utf8');
    const faces = (pkg: string) => [
      ...loaded.matchAll(new RegExp(`${pkg}/(\\d+)(-italic)?\\.css`, 'g')),
    ];
    const has = (pkg: string, weight: (w: number) => boolean, italic: boolean) =>
      faces(pkg).some((m) => weight(Number(m[1])) && Boolean(m[2]) === italic);
    const PACKAGES: Record<string, string> = {
      'Bricolage Grotesque': 'bricolage-grotesque',
      'Instrument Sans': 'instrument-sans',
      Anton: 'anton',
    };
    for (const [family, cut] of Object.entries(defaultBrand.fonts.cuts ?? {})) {
      const pkg = PACKAGES[family]!;
      expect(
        has(pkg, (w) => w <= 500, false),
        `${family} regular`
      ).toBe(true);
      expect(
        has(pkg, (w) => w >= 700, false),
        `${family} bold`
      ).toBe(cut.bold === true);
      expect(
        has(pkg, (w) => w <= 500, true),
        `${family} italic`
      ).toBe(cut.italic === true);
      expect(
        has(pkg, (w) => w >= 700, true),
        `${family} bold italic`
      ).toBe(cut.boldItalic === true);
    }
  });

  it('loads every family the brand names', () => {
    const loaded = readFileSync(new URL('./fonts.ts', import.meta.url), 'utf8');
    const { headline, body, quoteShort, quoteEmphasis, serif, condensed } = defaultBrand.fonts;
    for (const family of [headline, body, quoteShort, quoteEmphasis, serif, condensed]) {
      const pkg = family!.toLowerCase().replace(/ /g, '-');
      expect(loaded, family).toContain(`@fontsource/${pkg}/`);
    }
  });
});
