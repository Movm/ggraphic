// SPDX-License-Identifier: AGPL-3.0-only
import { type BrandPack } from '@ggraphic/core';
import { registerBrandPacks } from '@ggraphic/editor/brand';
import { createPageActions, type PageState } from '@ggraphic/editor/page';
import { TEMPLATE_GATE_ADAPTER } from '@ggraphic/editor/templates';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { studioBrand } from '../../brand';
import { rebindStudioDocument } from '../rebind';

import { catalogTemplate, templateFileOf } from './catalog';
import { templatePageState } from './instantiate';

beforeEach(() => registerBrandPacks([studioBrand]));
afterEach(() => registerBrandPacks([studioBrand]));

type Text = {
  id: string;
  type: string;
  text: string;
  fontSize: number;
  maxFontSize?: number;
  fontFamily: string;
  bind?: Record<string, { ref: string; value: string }>;
};
type Bound = { id: string; hug?: unknown };

function setup(initial: Partial<PageState> & Record<string, unknown>) {
  let state = {
    backgroundColor: '#000000',
    additionalTexts: [],
    shapeInstances: [],
    userImageInstances: [],
    layerOrder: [],
    ...initial,
  } as unknown as PageState;
  const history: PageState[] = [];
  const actions = createPageActions(
    () => state,
    (change) => {
      state = typeof change === 'function' ? change(state) : { ...state, ...change };
    },
    (saved) => history.push(saved ?? state),
    (saved) => history.push(saved ?? state),
    1080,
    1350,
    templateFileOf
  );
  const texts = () => state.additionalTexts as unknown as Text[];
  return { actions, state: () => state, history, texts };
}

const LONG = 'Gemeinschaftsgarten für alle Nachbarn';
const headline = (extra: Record<string, unknown> = {}): Text =>
  ({
    id: 'h',
    type: 'header',
    text: 'Hi',
    x: 0,
    y: 0,
    width: 600,
    fontSize: 200,
    maxFontSize: 200,
    fontFamily: 'Bricolage Grotesque, Arial, sans-serif',
    fill: '#fff',
    lineHeight: 1.1,
    bind: { fill: { ref: 'ink', value: '#ffffff' } },
    ...extra,
  }) as Text;

describe('setAdditionalTextFontRole', () => {
  it('writes the brand family with its fallbacks and the binding to the role, in one history step', () => {
    const { actions, texts, history } = setup({ additionalTexts: [headline()] as never });
    actions.setAdditionalTextFontRole('h', 'condensed');
    expect(texts()[0]!.fontFamily).toBe('Anton, Arial, sans-serif');
    expect(texts()[0]!.bind!['fontFamily']).toEqual({ ref: 'font.condensed', value: 'Anton' });
    // The bindings it had stay.
    expect(texts()[0]!.bind!['fill']).toEqual({ ref: 'ink', value: '#ffffff' });
    expect(history).toHaveLength(1);
    expect((history[0]!.additionalTexts as unknown as Text[])[0]!.bind!['fontFamily']!.ref).toBe(
      'font.condensed'
    );
  });

  it('gives a serif role the serif fallbacks', () => {
    const { actions, texts } = setup({ additionalTexts: [headline()] as never });
    actions.setAdditionalTextFontRole('h', 'serif');
    expect(texts()[0]!.fontFamily).toBe('Fraunces, Georgia, serif');
    expect(texts()[0]!.bind!['fontFamily']).toEqual({ ref: 'font.serif', value: 'Fraunces' });
  });

  it('refits a text with a prototype size to the new font', () => {
    const { actions, texts } = setup({ additionalTexts: [headline()] as never });
    actions.updateAdditionalText('h', { text: LONG });
    const bricolage = texts()[0]!.fontSize;
    expect(bricolage).toBeLessThan(200);
    // Anton is the narrower face: the same words fit bigger.
    actions.setAdditionalTextFontRole('h', 'condensed');
    expect(texts()[0]!.fontSize).toBeGreaterThan(bricolage);
    expect(texts()[0]!.fontSize).toBeLessThanOrEqual(200);
    // And back: the headline role fits what it fitted before.
    actions.setAdditionalTextFontRole('h', 'headline');
    expect(texts()[0]!.fontSize).toBe(bricolage);
  });

  it('keeps the size of a text without a prototype size', () => {
    const { actions, texts } = setup({
      additionalTexts: [headline({ text: LONG, maxFontSize: undefined, fontSize: 90 })] as never,
    });
    actions.setAdditionalTextFontRole('h', 'condensed');
    expect(texts()[0]!.fontSize).toBe(90);
  });

  it('touches no other text', () => {
    const other = headline({ id: 'o', fontFamily: 'Instrument Sans, Arial, sans-serif' });
    const { actions, texts } = setup({ additionalTexts: [headline(), other] as never });
    actions.setAdditionalTextFontRole('h', 'serif');
    expect(texts()[1]).toEqual(other);
  });

  it('does nothing for a text that is gone', () => {
    const { actions, history, state } = setup({ additionalTexts: [headline()] as never });
    const before = state();
    actions.setAdditionalTextFontRole('gone', 'serif');
    expect(history).toHaveLength(0);
    expect(state()).toBe(before);
  });

  it('moves the plate that hugs the text to the new font', () => {
    const { actions, state } = setup(
      templatePageState(
        catalogTemplate('studio-study-kicker-boxes')!,
        'post-portrait'
      ) as unknown as Partial<PageState>
    );
    const plateWidth = (s: PageState) =>
      TEMPLATE_GATE_ADAPTER.box(
        'shapeInstances',
        (s.shapeInstances as unknown as Bound[]).find((p) => p.id === 'plate-1') as never,
        1
      )!.width;
    const before = plateWidth(state());
    actions.setAdditionalTextFontRole('line-1', 'condensed');
    const after = plateWidth(state());
    expect(after).toBeLessThan(before);
    // The plate still hugs: it is not released by the font change.
    expect(
      (state().shapeInstances as unknown as Bound[]).find((p) => p.id === 'plate-1')!.hug
    ).toBeDefined();
  });

  it('stays bound: a brand with another font for the role takes the text along', () => {
    const { actions, state } = setup({ additionalTexts: [headline()] as never });
    actions.setAdditionalTextFontRole('h', 'condensed');
    const bebas: BrandPack = {
      ...studioBrand,
      id: 'bebas',
      fonts: { ...studioBrand.fonts, condensed: 'Bebas Neue' },
    };
    const doc = {
      formatId: 'post-portrait',
      pages: [{ configId: 'x', state: state() as unknown as Record<string, unknown> }],
    };
    const next = rebindStudioDocument(doc, { brand: bebas }).doc.pages[0]!.state;
    const text = (next['additionalTexts'] as Text[])[0]!;
    expect(text.fontFamily).toBe('Bebas Neue, Arial, sans-serif');
    expect(text.bind!['fontFamily']).toEqual({ ref: 'font.condensed', value: 'Bebas Neue' });
  });
});

describe('a new text is born bound to its role', () => {
  it.each([
    ['addHeader', 'font.headline', 'Bricolage Grotesque'],
    ['addSubheader', 'font.headline', 'Bricolage Grotesque'],
    ['addText', 'font.body', 'Instrument Sans'],
    ['addBodyTextWithContent', 'font.body', 'Instrument Sans'],
  ] as const)('%s binds its family to %s', (action, ref, family) => {
    const { actions, texts } = setup({});
    (actions[action] as (content?: string) => void)('Hello');
    const text = texts()[0]!;
    expect(text.fontFamily.startsWith(`${family},`)).toBe(true);
    expect(text.bind).toEqual({ fontFamily: { ref, value: family } });
  });

  it('follows a brand switch', () => {
    const { actions, state } = setup({});
    actions.addHeader();
    const lora: BrandPack = {
      ...studioBrand,
      id: 'lora',
      fonts: { ...studioBrand.fonts, headline: 'Lora' },
    };
    const doc = {
      formatId: 'post-portrait',
      pages: [{ configId: 'x', state: state() as unknown as Record<string, unknown> }],
    };
    const next = rebindStudioDocument(doc, { brand: lora }).doc.pages[0]!.state;
    expect((next['additionalTexts'] as Text[])[0]!.fontFamily).toBe('Lora, Arial, sans-serif');
  });
});
