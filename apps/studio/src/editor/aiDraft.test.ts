// SPDX-License-Identifier: AGPL-3.0-only
import { minTextSizePx } from '@ggraphic/core';
import { PLAIN_STYLE, wrapLines } from '@ggraphic/schema';
import { runMeasurer } from '@ggraphic/editor/utils/textUtils';
import { describe, expect, it } from 'vitest';

import { draftDeckOps, draftTexts, fillById, fillTexts } from './aiDraft';
import {
  BLANK_TEMPLATE_ID,
  FREE_PAGE_CONFIG_ID,
  HEADLINE_TEMPLATE_ID,
  QUOTE_TEMPLATE_ID,
} from './templates/ids';
import { seedFor } from './templates/seeds';
import { headlineFont } from './templates/typography';

const SIZE = { width: 1080, height: 1350 };
const draft = {
  headline: 'Street festival on Saturday',
  subline: 'Music, food and games for everyone',
  body: '12 June, 3 pm, old market square',
  callToAction: 'Bring your neighbours',
};

const page = (id: string, templateId: Parameters<typeof seedFor>[0]) => ({
  id,
  configId: templateId,
  state: { ...seedFor(templateId, SIZE.width, SIZE.height) } as Record<string, unknown>,
});

describe('draftTexts', () => {
  it('maps the draft fields onto the role ids and leaves out empty ones', () => {
    const texts = draftTexts({ headline: ' Hello ', subline: '', body: undefined });
    expect([...texts]).toEqual([['headline', 'Hello']]);
  });
});

describe('fillTexts', () => {
  it('fills every text that carries a role and keeps the others', () => {
    const texts = seedFor(QUOTE_TEMPLATE_ID, SIZE.width, SIZE.height).additionalTexts ?? [];
    const filled = fillTexts(texts, draft);
    expect(filled?.find((t) => t.id === 'headline')?.text).toBe(draft.headline);
    expect(filled?.find((t) => t.id === 'subline')?.text).toBe(draft.subline);
    // The quote mark is decoration, not a role.
    expect(filled?.find((t) => t.id === 'quote-mark')?.text).toBe('“');
  });

  it('shrinks a long headline to its slot instead of running into the subline', () => {
    const texts = seedFor(HEADLINE_TEMPLATE_ID, SIZE.width, SIZE.height).additionalTexts ?? [];
    const long = { ...draft, headline: 'Gemeinschaftsgarten Stadtrand wächst und wächst weiter' };
    const filled = fillTexts(texts, long)!;
    const headline = filled.find((t) => t.id === 'headline')!;
    const subline = filled.find((t) => t.id === 'subline')!;
    const seeded = texts.find((t) => t.id === 'headline')!;
    expect(headline.fontSize).toBeLessThan(seeded.fontSize!);
    // The wrapped headline ends above the subline.
    const lines = wrapLines(headline.text, headline.width!, (t) =>
      runMeasurer(headline.fontSize!, headlineFont(), 'bold')(t, PLAIN_STYLE)
    );
    expect(
      headline.y + lines.length * headline.fontSize! * (headline.lineHeight ?? 1)
    ).toBeLessThanOrEqual(subline.y);
    // A short headline keeps the seeded size.
    const short = fillTexts(texts, { ...draft, headline: 'Hello' })!;
    expect(short.find((t) => t.id === 'headline')!.fontSize).toBe(seeded.fontSize);
  });

  it('fitToSlot never shrinks a text below 0.035 of the canvas height', () => {
    const texts = seedFor(HEADLINE_TEMPLATE_ID, SIZE.width, SIZE.height).additionalTexts ?? [];
    const floor = minTextSizePx(SIZE.height);
    const huge = 'Gemeinschaftsgarten Stadtrand wächst und wächst weiter '.repeat(12);
    const fill = new Map([['headline', huge]]);
    const without = fillById(texts, fill).find((t) => t.id === 'headline')!;
    // The long text would shrink under the floor without it.
    expect(without.fontSize).toBeLessThan(floor);
    const floored = fillById(texts, fill, SIZE.height).find((t) => t.id === 'headline')!;
    expect(floored.fontSize).toBeGreaterThanOrEqual(floor);
  });

  it('keeps a text that is already below the floor and never grows it', () => {
    const texts = seedFor(HEADLINE_TEMPLATE_ID, SIZE.width, SIZE.height).additionalTexts ?? [];
    const small = texts.map((t) => (t.id === 'headline' ? { ...t, fontSize: 20 } : t));
    const out = fillById(small, new Map([['headline', 'x '.repeat(200)]]), SIZE.height).find(
      (t) => t.id === 'headline'
    )!;
    expect(out.fontSize).toBeLessThanOrEqual(20);
  });

  describe('a text with a prototype size (maxFontSize)', () => {
    const texts = () => {
      const seeded = seedFor(HEADLINE_TEMPLATE_ID, SIZE.width, SIZE.height).additionalTexts ?? [];
      return seeded.map((t) =>
        t.id === 'headline' ? { ...t, fontSize: 60, maxFontSize: 160, width: 900 } : t
      );
    };
    const headline = (list: ReturnType<typeof texts>, text: string, tweak = {}) =>
      fillById(
        list.map((t) => (t.id === 'headline' ? { ...t, ...tweak } : t)),
        new Map([['headline', text]]),
        SIZE.height
      ).find((t) => t.id === 'headline')!;

    it('grows a short text up to maxFontSize and shrinks a long one below it', () => {
      expect(headline(texts(), 'Hallo').fontSize).toBe(160);
      expect(headline(texts(), 'Gemeinschaftsgarten Stadtrand wächst').fontSize).toBeLessThan(160);
    });

    it('never breaks a word to fit', () => {
      const out = headline(texts(), 'Gemeinschaftsgartenverein');
      const word = runMeasurer(
        out.fontSize!,
        headlineFont(),
        'bold'
      )('Gemeinschaftsgartenverein', PLAIN_STYLE);
      expect(word).toBeLessThanOrEqual(out.width!);
    });

    it('measures the weight and letter spacing the text is drawn with', () => {
      const long = 'Gemeinschaftsgarten Stadtrand';
      const plain = headline(texts(), long).fontSize!;
      expect(headline(texts(), long, { letterSpacing: 0.15 }).fontSize!).toBeLessThan(plain);
      expect(headline(texts(), long, { letterSpacing: -0.05 }).fontSize!).toBeGreaterThanOrEqual(
        plain
      );
    });

    it('RF1: a text without maxFontSize is never grown', () => {
      const plain = texts().map((t) =>
        t.id === 'headline' ? { ...t, maxFontSize: undefined } : t
      );
      const seeded = plain.find((t) => t.id === 'headline')!;
      expect(headline(plain, 'Hallo').fontSize).toBe(seeded.fontSize);
    });
  });

  it('returns null for a page without a headline or subline', () => {
    expect(fillTexts([], draft)).toBeNull();
  });
});

describe('draftDeckOps', () => {
  it('fills the active page in place when it has role texts', () => {
    const pages = [page('a', BLANK_TEMPLATE_ID), page('b', HEADLINE_TEMPLATE_ID)];
    const ops = draftDeckOps(pages, 'b', draft, SIZE);
    expect(ops.inserts).toEqual([]);
    expect(ops.updates).toHaveLength(1);
    expect(ops.updates[0]!.pageId).toBe('b');
    const texts = ops.updates[0]!.state['additionalTexts'] as { id: string; text: string }[];
    expect(texts.map((t) => [t.id, t.text])).toEqual([
      ['headline', draft.headline],
      ['subline', draft.subline],
      ['body', draft.body],
      ['cta', draft.callToAction],
    ]);
    // The rest of the page stays as it was.
    expect(ops.updates[0]!.state['backgroundColor']).toBe(pages[1]!.state['backgroundColor']);
  });

  it('adds a "Headline + text" page after a page with nothing to fill', () => {
    const ops = draftDeckOps(
      [page('a', BLANK_TEMPLATE_ID)],
      'a',
      { ...draft, callToAction: undefined },
      SIZE
    );
    expect(ops.updates).toEqual([]);
    expect(ops.inserts).toHaveLength(1);
    const insert = ops.inserts[0]!;
    expect(insert.afterPageId).toBe('a');
    expect(insert.configId).toBe(FREE_PAGE_CONFIG_ID);
    const texts = insert.state['additionalTexts'] as { id: string; text: string }[];
    // No call to action in the draft: its text is left off the new page.
    expect(texts.map((t) => t.id)).toEqual(['headline', 'subline', 'body']);
    expect(insert.state['layerOrder']).toEqual(['accent-bar', 'headline', 'subline', 'body']);
  });

  it('falls back to the first page when the active one is unknown', () => {
    const ops = draftDeckOps([page('a', HEADLINE_TEMPLATE_ID)], null, draft, SIZE);
    expect(ops.updates[0]!.pageId).toBe('a');
  });
});
