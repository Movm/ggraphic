// SPDX-License-Identifier: AGPL-3.0-only
import { deriveSchemes } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { describe, expect, it } from 'vitest';

import { BLANK_TEMPLATE_ID } from '../editor/templates/ids';
import { seedFor } from '../editor/templates/seeds';

import { pickOffers } from './aiOffers';

describe('pickOffers', () => {
  const { templates, schemes } = pickOffers();

  it('offers every template but the blank one', () => {
    expect(templates.map((t) => t.id)).toEqual([
      'studio-headline',
      'studio-quote',
      'studio-number',
    ]);
    expect(templates.some((t) => t.id === BLANK_TEMPLATE_ID)).toBe(false);
  });

  it('lists only text ids the template seed carries, with a limit each', () => {
    for (const t of templates) {
      const seedIds = (seedFor(t.id as never, 1080, 1080).additionalTexts ?? []).map((x) => x.id);
      expect(t.slots.length).toBeGreaterThan(0);
      for (const slot of t.slots) {
        expect(seedIds).toContain(slot.id);
        expect(slot.maxChars).toBeGreaterThan(0);
      }
    }
  });

  it('keeps decorative texts out of the slots', () => {
    const quote = templates.find((t) => t.id === 'studio-quote')!;
    expect(quote.slots.map((s) => s.id)).toEqual(['headline', 'subline']);
    const number = templates.find((t) => t.id === 'studio-number')!;
    expect(number.slots.map((s) => s.id)).toEqual(['number', 'headline', 'subline']);
  });

  it('offers the colour worlds of the active brand, capitalised', () => {
    const ids = deriveSchemes(activeBrand()).map((s) => s.id);
    expect(schemes.map((s) => s.id)).toEqual(ids);
    expect(schemes.find((s) => s.id === 'primary')?.label).toBe('Primary');
  });
});
