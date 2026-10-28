// SPDX-License-Identifier: AGPL-3.0-only
import { deriveSchemes } from '@ggraphic/core';
import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { studioBrand } from '../brand';

import { BLANK_TEMPLATE_ID } from '../editor/templates/ids';
import { seedFor } from '../editor/templates/seeds';

import { pickOffers } from './aiOffers';

// The pack's quote lives in two worlds; for the test of the `brand` argument it lives in one.
const mocks = vi.hoisted(() => ({ lightOnlyQuote: false }));
vi.mock('../editor/templates/catalog', async (importOriginal) => {
  const real = await importOriginal<typeof import('../editor/templates/catalog')>();
  return {
    ...real,
    templatesFor: (formatId: string, brand: Parameters<typeof real.templatesFor>[1]) =>
      real.templatesIn(
        real
          .studioCatalog()
          .entries.map((e) =>
            mocks.lightOnlyQuote && e.id === 'studio-quote'
              ? { ...e, template: { ...e.template, schemes: ['light' as const] } }
              : e
          ),
        formatId,
        brand ?? activeBrand()
      ),
  };
});

afterEach(() => {
  mocks.lightOnlyQuote = false;
  registerBrandPacks([studioBrand]);
});

describe('pickOffers', () => {
  const { templates, schemes } = pickOffers('post-portrait');

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

describe('pickOffers per call', () => {
  it('keeps a template whose other world the active brand still has', () => {
    const near = {
      ...studioBrand,
      id: 'near',
      colors: { ...studioBrand.colors, secondary: '#FAFAFA' },
    };
    registerBrandPacks([near, studioBrand]);
    // The quote offers the light and the primary world; this brand drops only the light one.
    expect(pickOffers('post-portrait', near).templates.map((t) => t.id)).toContain('studio-quote');
    expect(pickOffers('post-portrait', studioBrand).templates.map((t) => t.id)).toContain(
      'studio-quote'
    );
  });

  it('passes its brand on: a template whose only world the brand drops is left out', () => {
    mocks.lightOnlyQuote = true;
    const near = {
      ...studioBrand,
      id: 'near',
      colors: { ...studioBrand.colors, secondary: '#FAFAFA' },
    };
    const ids = (brand: typeof near) =>
      pickOffers('post-portrait', brand).templates.map((t) => t.id);
    expect(ids(studioBrand)).toContain('studio-quote');
    expect(ids(near)).not.toContain('studio-quote');
  });

  it('offers nothing on a format no template covers', () => {
    expect(pickOffers('story').templates).toEqual([]);
  });
});
