// SPDX-License-Identifier: AGPL-3.0-only
import { deriveSchemes, type BrandPack } from '@ggraphic/core';
import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OFFER_ID_PATTERN } from '@ggraphic/schema';
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

describe('pickOffers with hidden templates', () => {
  it('leaves out the templates the organisation hid', () => {
    const all = pickOffers('post-portrait').templates.map((t) => t.id);
    expect(all).toContain('studio-quote');
    const rest = pickOffers('post-portrait', activeBrand(), new Set(['studio-quote'])).templates;
    // The offer is capped, so a hidden template lets the next one move up.
    expect(rest.map((t) => t.id).slice(0, all.length - 1)).toEqual(
      all.filter((id) => id !== 'studio-quote')
    );
  });
});

const LEGACY_IDS = ['studio-headline', 'studio-quote', 'studio-number'];

describe('pickOffers', () => {
  const { templates, schemes } = pickOffers('post-portrait');

  it('offers every template but the blank one', () => {
    expect(templates.map((t) => t.id)).toEqual([
      'studio-headline',
      'studio-quote',
      'studio-number',
      'studio-event-giant-date',
      'studio-event-photo-date',
      'studio-event-programme',
      'studio-event-date-bands',
      'studio-event-countdown',
      'studio-event-panel',
      'studio-photo-quote',
      'studio-photo-number',
      'studio-quote-giant-mark',
    ]);
    expect(templates.some((t) => t.id === BLANK_TEMPLATE_ID)).toBe(false);
  });

  it('builds the offers from the catalogue: ids, labels and budgets of the quote', () => {
    expect(templates.map((t) => t.id)).toEqual([
      'studio-headline',
      'studio-quote',
      'studio-number',
      'studio-event-giant-date',
      'studio-event-photo-date',
      'studio-event-programme',
      'studio-event-date-bands',
      'studio-event-countdown',
      'studio-event-panel',
      'studio-photo-quote',
      'studio-photo-number',
      'studio-quote-giant-mark',
    ]);
    expect(templates.find((t) => t.id === 'studio-quote')!.slots).toEqual([
      { id: 'headline', label: 'The quotation', maxChars: 160 },
      { id: 'subline', label: 'Who said it', maxChars: 50 },
    ]);
  });

  it('lists only text ids the template seed carries, with a limit each', () => {
    for (const t of templates.filter((x) => LEGACY_IDS.includes(x.id))) {
      const seedIds = (seedFor(t.id as never, 1080, 1080).additionalTexts ?? []).map((x) => x.id);
      expect(t.slots.length).toBeGreaterThan(0);
      for (const slot of t.slots) {
        expect(seedIds).toContain(slot.id);
        expect(slot.maxChars).toBeGreaterThan(0);
      }
    }
  });

  it('offers the file-based templates only text ids their page carries, with a limit each', () => {
    const files = templates.filter((x) => !LEGACY_IDS.includes(x.id));
    expect(files.length).toBeGreaterThan(0);
    for (const t of files) {
      const state = studioCatalog().entries.find((e) => e.id === t.id)!.template.pages[0].state;
      const textIds = ((state['additionalTexts'] ?? []) as { id: string }[]).map((x) => x.id);
      expect(t.slots.length).toBeGreaterThan(0);
      for (const slot of t.slots) {
        expect(textIds).toContain(slot.id);
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

describe('the offers fit the server contract', () => {
  // `pickBody` (apps/studio-server) takes ids by OFFER_ID_PATTERN and caps text lengths and counts;
  // the Studio cannot import the server, so the same limits are checked here.
  it.each(['profile-square', 'post-portrait', 'slide-16-9'])(
    'every id, label and budget offered for %s is one pickBody takes',
    (formatId) => {
      const { templates } = pickOffers(formatId);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.length).toBeLessThanOrEqual(12);
      for (const t of templates) {
        expect(t.id).toMatch(OFFER_ID_PATTERN);
        expect(t.label.length).toBeLessThanOrEqual(200);
        expect(t.description.length).toBeLessThanOrEqual(200);
        expect(t.slots.length).toBeGreaterThanOrEqual(1);
        expect(t.slots.length).toBeLessThanOrEqual(8);
        for (const slot of t.slots) {
          expect(slot.id).toMatch(OFFER_ID_PATTERN);
          expect(slot.maxChars).toBeGreaterThanOrEqual(1);
          expect(slot.maxChars).toBeLessThanOrEqual(2000);
        }
      }
    }
  );
});
