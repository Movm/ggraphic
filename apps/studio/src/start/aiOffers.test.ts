// SPDX-License-Identifier: AGPL-3.0-only
import { deriveSchemes, type BrandPack } from '@ggraphic/core';
import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { studioBrand } from '../brand';

import { BLANK_TEMPLATE_ID } from '../editor/templates/ids';
import { studioCatalog, type templatesIn, type CatalogEntry } from '../editor/templates/catalog';
import { seedFor } from '../editor/templates/seeds';

import { pickOffers } from './aiOffers';

// The pack's quote lives in two worlds; for the test of the `brand` argument it lives in one.
const mocks = vi.hoisted(() => ({
  lightOnlyQuote: false,
  stub: null as unknown[] | null,
}));
vi.mock('../editor/templates/catalog', async (importOriginal) => {
  const real = await importOriginal<
    Record<string, unknown> & {
      templatesIn: typeof templatesIn;
      studioCatalog: typeof studioCatalog;
    }
  >();
  return {
    ...real,
    templatesFor: (formatId: string, brand: BrandPack | undefined) =>
      real.templatesIn(
        ((mocks.stub ?? real.studioCatalog().entries) as CatalogEntry[]).map((e) =>
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
  mocks.stub = null;
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

  it('builds the offers from the catalogue: ids, labels and budgets of the quote', () => {
    expect(templates.map((t) => t.id)).toEqual([
      'studio-headline',
      'studio-quote',
      'studio-number',
    ]);
    expect(templates.find((t) => t.id === 'studio-quote')!.slots).toEqual([
      { id: 'headline', label: 'The quotation', maxChars: 160 },
      { id: 'subline', label: 'Who said it', maxChars: 50 },
    ]);
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

describe('pickOffers from a stub catalogue', () => {
  const entry = (id: string, formats: string[], slots: Record<string, unknown>, ids: string[]) => ({
    ...studioCatalog().entries[0]!,
    id,
    formats,
    template: {
      ...studioCatalog().entries[0]!.template,
      id,
      formats,
      schemes: ['light'],
      slots,
      pages: [{ state: { additionalTexts: ids.map((i) => ({ id: i })) } }],
    },
  });
  const text = (maxChars: number) => ({ role: 'body', budget: { maxChars } });

  it('offers none of the templates a format is not declared by', () => {
    mocks.stub = [entry('only-45', ['4:5'], { a: text(10) }, ['a'])];
    expect(pickOffers('profile-square').templates).toEqual([]);
    expect(pickOffers('post-portrait').templates.map((t) => t.id)).toEqual(['only-45']);
  });

  it('leaves out a template without a text slot and a photo slot from the slots', () => {
    mocks.stub = [
      entry('photo-only', ['4:5'], { p: { role: 'photo', budget: {} } }, ['p']),
      entry('mixed', ['4:5'], { p: { role: 'photo', budget: {} }, a: text(10) }, ['p', 'a']),
    ];
    const t = pickOffers('post-portrait').templates;
    expect(t.map((x) => x.id)).toEqual(['mixed']);
    expect(t[0]!.slots).toEqual([{ id: 'a', label: 'Body text', maxChars: 10 }]);
  });

  it('takes at most 12 templates and 8 slots, in order', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `s${i}`);
    const slots = Object.fromEntries(ids.map((i) => [i, text(5)]));
    mocks.stub = Array.from({ length: 14 }, (_, i) => entry(`t${i}`, ['4:5'], slots, ids));
    const t = pickOffers('post-portrait').templates;
    expect(t).toHaveLength(12);
    expect(t[0]!.slots.map((s) => s.id)).toEqual(ids.slice(0, 8));
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
