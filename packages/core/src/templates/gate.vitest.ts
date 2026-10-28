// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { brandDefault } from '../brand/brandDefault.js';
import { offeredSchemes, type TemplateInput } from './instantiate.js';
import {
  checkTemplate,
  GATE_RULES,
  type GateAdapter,
  type GateContext,
  type GateRule,
} from './gate.js';

type Obj = Record<string, unknown>;
const num = (el: Obj, k: string, d = 0) => (typeof el[k] === 'number' ? (el[k] as number) : d);

/** A small stand-in for an editor's element kinds: top-left boxes, no transforms. */
const adapter: GateAdapter = {
  geometry: {
    additionalTexts: { x: 'x', y: 'y', width: 'w', fontSize: 's' },
    shapeInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
    userImageInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
  },
  colorFields: {
    page: ['backgroundColor'],
    additionalTexts: ['fill'],
    shapeInstances: ['fill'],
    userImageInstances: ['src'],
  },
  box: (key, el, lines) =>
    key === 'additionalTexts'
      ? {
          x: num(el, 'x'),
          y: num(el, 'y'),
          width: num(el, 'width'),
          height: num(el, 'fontSize') * 1.2 * lines,
        }
      : { x: num(el, 'x'), y: num(el, 'y'), width: num(el, 'width'), height: num(el, 'height') },
  text: (key, el) =>
    key === 'additionalTexts'
      ? {
          fill: String(el['fill'] ?? ''),
          fontSize: num(el, 'fontSize'),
          bold: String(el['fontStyle'] ?? '').includes('bold'),
        }
      : null,
  fill: (key, el) => (key === 'shapeInstances' ? String(el['fill'] ?? '') : null),
};

const logo = {
  id: 'logo',
  src: '',
  x: 0.75,
  y: 0.9,
  width: 0.25,
  height: 0.1,
  bind: { src: 'brand.logo' },
};
const headline = {
  id: 'headline',
  text: 'Hello',
  x: 0,
  y: 0.3,
  width: 1,
  fontSize: 0.06,
  fill: '#ffffff',
  bind: { fill: 'ink' },
};

function template(over: Partial<TemplateInput> = {}, state: Obj = {}): TemplateInput {
  return {
    id: 't',
    version: 1,
    formats: ['1:1'],
    schemes: ['primary'],
    logoCorners: ['top-left'],
    placeholders: { en: { headline: 'Hello there' } },
    pages: [
      {
        state: {
          backgroundColor: '#000000',
          bind: { backgroundColor: 'ground' },
          additionalTexts: [headline],
          userImageInstances: [logo],
          ...state,
        },
      },
    ],
    ...over,
  };
}

const context = (over: Partial<GateContext> = {}): GateContext => ({
  brands: [brandDefault],
  canvases: { '1:1': { width: 1080, height: 1080 } },
  adapter,
  manifestPaths: new Set(['/ok.png']),
  slots: { headline: { role: 'headline', budget: { maxWords: 8, maxLines: 2, maxChars: 60 } } },
  placeholderTexts: { headline: 'Hello there' },
  ...over,
});

/** A brand whose secondary ground is its primary one, so the secondary world is dropped. */
const flat = {
  ...brandDefault,
  colors: { ...brandDefault.colors, secondary: brandDefault.colors.primary },
};

const rules = (t: TemplateInput, ctx = context()) => checkTemplate(t, ctx).map((p) => p.rule);

describe('render gate stage 1', () => {
  it('lists every rule once', () => {
    expect(new Set(GATE_RULES).size).toBe(GATE_RULES.length);
  });

  it('passes a sound template', () => {
    expect(checkTemplate(template(), context())).toEqual([]);
  });

  const cases: Record<GateRule, () => [TemplateInput, GateContext]> = {
    bounds: () => [
      template(),
      context({
        slots: { headline: { role: 'headline', budget: { maxLines: 20, maxChars: 60 } } },
      }),
    ],
    'logo-overlap': () => [template({}, { additionalTexts: [{ ...headline, y: 0 }] }), context()],
    contrast: () => [
      template(
        { fixed: { headline: ['fill'] } },
        { additionalTexts: [{ ...headline, fill: '#2a4a70', bind: undefined }] }
      ),
      context(),
    ],
    budget: () => [template(), context({ slots: { headline: { role: 'headline', budget: {} } } })],
    'unbound-colour': () => [
      template({}, { additionalTexts: [{ ...headline, bind: undefined }] }),
      context(),
    ],
    'asset-licence': () => [
      template(
        {},
        {
          userImageInstances: [
            logo,
            { id: 'pic', src: '/nope.png', x: 0.4, y: 0.7, width: 0.1, height: 0.1 },
          ],
        }
      ),
      context(),
    ],
    'marker-role': () => [
      template(
        {},
        {
          shapeInstances: [
            {
              id: 'chip',
              x: 0.9,
              y: 0,
              width: 0.1,
              height: 0.05,
              fill: '#ffffff',
              bind: { fill: 'marker' },
            },
          ],
        }
      ),
      context(),
    ],
    'scheme-coverage': () => [template({ schemes: ['secondary'] }), context({ brands: [flat] })],
    'logo-corners': () => [template({ logoCorners: [] }), context()],
  };

  it.each(GATE_RULES)('turns exactly %s red', (rule) => {
    const [t, ctx] = cases[rule]();
    expect(rules(t, ctx)).toEqual([rule]);
  });

  it('the scheme-coverage case really has a brand that keeps none of the worlds', () => {
    expect(offeredSchemes({ schemes: ['secondary'] }, flat)).toEqual([]);
    expect(offeredSchemes({ schemes: ['secondary'] }, brandDefault)).toEqual(['secondary']);
  });

  it('flags a logo inside a block', () => {
    const t = template({ blocks: [{ id: 'b', elementIds: ['logo', 'headline'] }] });
    expect(rules(t)).toEqual(['logo-corners']);
  });

  it('flags placeholders over the budget and a word cap above 60 outside body and quote', () => {
    const long = context({
      placeholderTexts: { headline: 'one two three four five six seven eight nine' },
    });
    expect(rules(template(), long)).toEqual(['budget']);
    const cap = context({ slots: { headline: { role: 'headline', budget: { maxWords: 61 } } } });
    expect(rules(template(), cap)).toEqual(['budget']);
    const body = context({ slots: { headline: { role: 'body', budget: { maxWords: 61 } } } });
    expect(rules(template(), body)).toEqual([]);
  });

  it('holds large text to 3.0 and small text to 4.5', () => {
    // #6d84a3 on #1d3557 is between 3 and 4.5: fine at 24 px+, not below.
    const grey = (fontSize: number) =>
      template(
        { fixed: { headline: ['fill'] } },
        { additionalTexts: [{ ...headline, fontSize, fill: '#7f93ad', bind: undefined }] }
      );
    expect(rules(grey(0.06))).toEqual([]);
    expect(rules(grey(0.015))).toEqual(['contrast']);
  });

  it('reads the ground off the topmost shape under the text', () => {
    const panel = {
      id: 'panel',
      x: 0,
      y: 0.25,
      width: 1,
      height: 0.3,
      fill: '#ffffff',
      bind: { fill: 'ink' },
    };
    expect(
      rules(template({}, { shapeInstances: [panel], layerOrder: ['panel', 'logo', 'headline'] }))
    ).toEqual(['contrast']);
  });
});
