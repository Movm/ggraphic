// SPDX-License-Identifier: AGPL-3.0-only
import { roomBelow, type BrandPack } from '@ggraphic/core';
import { TEMPLATE_GATE_ADAPTER } from '@ggraphic/editor/templates/templateGeometry';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { createPageActions } from '@ggraphic/editor/page/actions';
import { type PageState } from '@ggraphic/editor/page/pageState';
import { afterEach, describe, expect, it } from 'vitest';

import { studioBrand } from '../../brand';
import { formatSize } from '../document';
import { rebindStudioDocument } from '../rebind';

import { buildCatalog, catalogTemplate, type CatalogEntry, templateFileOf } from './catalog';
import { templatePageState } from './instantiate';

afterEach(() => registerBrandPacks([studioBrand]));

const brandWith = (headline: string): BrandPack => ({
  ...studioBrand,
  id: `fit-${headline}`,
  fonts: { ...studioBrand.fonts, headline },
});
const ANTON = brandWith('Anton');
const FRAUNCES = brandWith('Fraunces');

type Text = { id: string; fontSize: number; maxFontSize?: number; text: string };
const headlineOf = (state: Record<string, unknown> | null): Text =>
  (state!['additionalTexts'] as Text[]).find((t) => t.id === 'headline')!;

/** The studio headline template with its headline text carrying the prototype size 0.4 (432 px at 1080). */
function fittedEntry(maxFontSize: number | null = 0.4): CatalogEntry {
  const file = structuredClone(catalogTemplate('studio-headline')!.template);
  const head = (file.pages[0].state['additionalTexts'] as Record<string, unknown>[])[0]!;
  if (maxFontSize !== null) head['maxFontSize'] = maxFontSize;
  else delete head['maxFontSize'];
  head['fontSize'] = 0.096296;
  file.placeholders['en']!['headline'] = 'Gute Nachrichten für alle Menschen';
  return buildCatalog([{ source: 'pack', files: [file] }]).entries[0]!;
}

describe('templatePageState fits texts with a maxFontSize', () => {
  it('fits to different sizes in two brands whose headline fonts differ in width', () => {
    const entry = fittedEntry();
    const anton = headlineOf(templatePageState(entry, 'post-portrait', { brand: ANTON }));
    const fraunces = headlineOf(templatePageState(entry, 'post-portrait', { brand: FRAUNCES }));
    expect(anton.fontSize).toBeGreaterThan(fraunces.fontSize);
    expect(anton.fontSize).toBeLessThanOrEqual(anton.maxFontSize!);
    expect(headlineOf(templatePageState(entry, 'post-portrait', { brand: ANTON }))).toEqual(anton);
  });

  it('scales the ceiling with the format like the size', () => {
    const state = templatePageState(fittedEntry(), 'profile-square', { brand: ANTON });
    expect(headlineOf(state).maxFontSize).toBe(Math.round(0.4 * 1080));
  });

  it('RF1: without maxFontSize the placed size is the plain scaled one', () => {
    const state = templatePageState(fittedEntry(null), 'post-portrait', { brand: FRAUNCES });
    expect(headlineOf(state).fontSize).toBe(Math.round(0.096296 * 1080));
    expect(headlineOf(state)).not.toHaveProperty('maxFontSize');
  });
});

describe('rebinding to another brand font refits', () => {
  const docOn = (brand: BrandPack, entry = fittedEntry()) => ({
    formatId: 'post-portrait',
    pages: [
      {
        configId: 'studio-headline',
        state: templatePageState(entry, 'post-portrait', { brand })!,
      },
    ],
  });

  it('grows or shrinks the text with the new font, within its ceiling', () => {
    const doc = docOn(ANTON);
    const before = headlineOf(doc.pages[0]!.state);
    const { doc: next, changed } = rebindStudioDocument(doc, { brand: FRAUNCES });
    expect(changed).toBe(true);
    const after = headlineOf(next.pages[0]!.state);
    expect(after.fontSize).toBeLessThan(before.fontSize);
    expect(after.fontSize).toBe(
      headlineOf(templatePageState(fittedEntry(), 'post-portrait', { brand: FRAUNCES })).fontSize
    );
  });

  it('RF1: a text without maxFontSize keeps its size when the font changes', () => {
    const doc = docOn(ANTON, fittedEntry(null));
    const before = headlineOf(doc.pages[0]!.state).fontSize;
    const next = rebindStudioDocument(doc, { brand: FRAUNCES }).doc;
    expect(headlineOf(next.pages[0]!.state).fontSize).toBe(before);
    expect(formatSize(next.formatId).height).toBe(1350);
  });
});

describe('committing a text edit', () => {
  function setup(extra: Record<string, unknown> = { maxFontSize: 200 }) {
    let state = {
      backgroundColor: '#000000',
      additionalTexts: [
        {
          id: 'h',
          type: 'header',
          text: 'Hi',
          x: 0,
          y: 0,
          width: 600,
          fontSize: 200,
          fontFamily: 'Bricolage Grotesque',
          fill: '#fff',
          lineHeight: 1.1,
          ...extra,
        },
      ],
      shapeInstances: [],
      userImageInstances: [],
      layerOrder: [],
    } as unknown as PageState;
    let history = 0;
    const actions = createPageActions(
      () => state,
      (change) => {
        state = typeof change === 'function' ? change(state) : { ...state, ...change };
      },
      () => {
        history++;
      },
      () => {
        history++;
      },
      1080,
      1350,
      templateFileOf
    );
    const size = () => (state.additionalTexts[0] as unknown as Text).fontSize;
    return { actions, size, history: () => history };
  }

  it('shrinks as the text grows and grows back as it shrinks, up to maxFontSize', () => {
    const { actions, size } = setup();
    expect(size()).toBe(200);
    actions.updateAdditionalText('h', { text: 'Gemeinschaftsgarten' });
    expect(size()).toBeLessThan(200);
    actions.updateAdditionalText('h', { text: 'Hi' });
    expect(size()).toBe(200);
  });

  it('previews the fitted size while typing, leaving the page and the history alone', () => {
    const { actions, size, history } = setup();
    const preview = actions.previewAdditionalText!('h', 'Gemeinschaftsgarten')!;
    expect(preview.fontSize).toBeLessThan(200);
    // The size is offered to the canvas, not written: the page still has the committed one.
    expect(size()).toBe(200);
    expect(history()).toBe(0);
    const drawn = (preview.overrides['additionalTexts'] as Text[]).find((t) => t.id === 'h')!;
    expect(drawn.fontSize).toBe(preview.fontSize);
    // The text is not part of the preview: the commit writes it.
    expect(drawn.text).toBe('Hi');

    actions.updateAdditionalText('h', { text: 'Gemeinschaftsgarten' });
    expect(size()).toBe(preview.fontSize);
  });

  it('previews no size for a text without maxFontSize, and nothing for a text that is gone', () => {
    const { actions } = setup({});
    expect(actions.previewAdditionalText!('h', 'Gemeinschaftsgarten')!.fontSize).toBeNull();
    expect(actions.previewAdditionalText!('gone', 'Hi')).toBeNull();
  });

  it('does not refit on a move, or when the size is set by hand', () => {
    const { actions, size } = setup();
    actions.updateAdditionalText('h', { text: 'Gemeinschaftsgarten' });
    const fitted = size();
    actions.updateAdditionalText('h', { x: 40 });
    expect(size()).toBe(fitted);
    actions.updateAdditionalText('h', { text: 'Gemeinschaftsgartenverein', fontSize: 77 });
    expect(size()).toBe(77);
  });

  it('RF1: a text without maxFontSize keeps its size', () => {
    const { actions, size } = setup({});
    actions.updateAdditionalText('h', { text: 'Gemeinschaftsgarten' });
    expect(size()).toBe(200);
  });
});

describe('fitted text stops above the element below it', () => {
  type Placed = Record<string, number | string>;
  const factBars = (brand: BrandPack) =>
    templatePageState(catalogTemplate('studio-fact-bar-chart')!, 'post-portrait', { brand })!;

  it('headline and subline of the fact bar chart end above what lies below them', () => {
    for (const brand of [studioBrand, ANTON, FRAUNCES]) {
      const state = factBars(brand);
      const texts = state['additionalTexts'] as Placed[];
      for (const id of ['headline', 'subline']) {
        const t = texts.find((x) => x['id'] === id)!;
        const room = roomBelow(state, 'additionalTexts', t, (k, e) =>
          TEMPLATE_GATE_ADAPTER.box(k, e, 1)
        );
        const lines = TEMPLATE_GATE_ADAPTER.lineCount('additionalTexts', t);
        const size = t['fontSize'] as number;
        const lh = (t['lineHeight'] as number) ?? 1.2;
        expect(room).toBeDefined();
        expect(lines * size * lh + 0.25 * lh * size).toBeLessThanOrEqual(room! + 0.5);
      }
    }
  });
});
