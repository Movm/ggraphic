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
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (el: Obj, k: string, d = 0) => (typeof el[k] === 'number' ? (el[k] as number) : d);

/** A small stand-in for an editor's element kinds: top-left boxes, no transforms. */
const adapter: GateAdapter = {
  geometry: {
    additionalTexts: { x: 'x', y: 'y', width: 'w', fontSize: 's' },
    shapeInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
    userImageInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
    frameInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
    pillBadgeInstances: { x: 'x', y: 'y' },
    illustrationInstances: { x: 'x', y: 'y', scale: 'k' },
    iconStates: { x: 'x', y: 'y', scale: 'k' },
  },
  colorFields: {
    page: ['backgroundColor'],
    additionalTexts: ['fill'],
    shapeInstances: ['fill'],
    pillBadgeInstances: ['backgroundColor', 'textColor'],
  },
  assetFields: { userImageInstances: ['src'], frameInstances: ['imageSrc'] },
  nestedColors(key, el) {
    const stops =
      key === 'shapeInstances' && isObj(el['fillGradient']) ? el['fillGradient']['stops'] : [];
    return [
      ...(Array.isArray(stops) ? stops : []).map((s: Obj) => ({
        field: 'fillGradient',
        value: String(s['color']),
      })),
      ...(key === 'additionalTexts' && isObj(el['accent'])
        ? [{ field: 'accent', value: String(el['accent']['fill']) }]
        : []),
    ];
  },
  assetRefs: (key, el) =>
    key === 'illustrationInstances'
      ? [{ kind: 'illustration', id: `${String(el['source'])}:${String(el['illustrationId'])}` }]
      : key === 'iconStates'
        ? [{ kind: 'icon', id: String(el['iconId']) }]
        : [],
  lineCount: (key, el) =>
    key === 'additionalTexts' && typeof el['text'] === 'string' ? el['text'].split('\n').length : 1,
  box: (key, el, lines) =>
    key === 'additionalTexts'
      ? {
          x: num(el, 'x'),
          y: num(el, 'y'),
          width: num(el, 'width'),
          height: num(el, 'fontSize') * 1.2 * lines,
        }
      : key === 'pillBadgeInstances'
        ? null
        : { x: num(el, 'x'), y: num(el, 'y'), width: num(el, 'width'), height: num(el, 'height') },
  text: (key, el) =>
    key === 'additionalTexts'
      ? {
          fill: String(el['fill'] ?? ''),
          fontSize: num(el, 'fontSize'),
          bold: String(el['fontStyle'] ?? '').includes('bold'),
          opacity: num(el, 'opacity', 1),
          ...(el['fillGradient'] ? { notCheckable: 'text gradient not checkable' } : {}),
        }
      : key === 'pillBadgeInstances'
        ? {
            fill: String(el['textColor']),
            fontSize: num(el, 'fontSize'),
            bold: false,
            opacity: num(el, 'opacity', 1),
            ground: String(el['backgroundColor']),
          }
        : null,
  cover: (key, el) =>
    key === 'shapeInstances'
      ? el['fillGradient'] || num(el, 'opacity', 1) < 1
        ? { kind: 'unknown' }
        : { kind: 'solid', fill: String(el['fill'] ?? '') }
      : key === 'additionalTexts'
        ? null
        : { kind: 'unknown' },
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
  allowedAssets: { illustration: ['kawaii:'], icon: ['tabler:tree'] },
  slots: { headline: { role: 'headline', budget: { maxWords: 8, maxLines: 2, maxChars: 60 } } },
  placeholderTexts: { headline: 'Hello there' },
  ...over,
});

/** A brand whose secondary ground is its primary one, so the secondary world is dropped. */
const flat = {
  ...brandDefault,
  colors: { ...brandDefault.colors, secondary: brandDefault.colors.primary },
};

/** The rules that fired, once each: one finding per brand, world, format and layout is expected. */
const rules = (t: TemplateInput, ctx = context()) => [
  ...new Set(checkTemplate(t, ctx).map((p) => p.rule)),
];

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
    // Centred on the logo: logo-overlap owns that case, the ground search skips the logo.
    'logo-overlap': () => [
      template({}, { additionalTexts: [{ ...headline, y: 0, width: 0.2, fontSize: 0.03 }] }),
      context(),
    ],
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
    // #7f93ad on #1d3557 is between 3 and 4.5: fine at 24 px+, not below.
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

  describe('fails closed on a ground it cannot determine', () => {
    const NOT = 'ground not determinable';
    const fixedFill = (over: Obj) => ({
      id: 'panel',
      x: 0,
      y: 0.25,
      width: 1,
      height: 0.3,
      ...over,
    });
    const order = ['panel', 'logo', 'headline'];
    const withShape = (shape: Obj, fixed: Record<string, string[]> = { panel: ['fill'] }) =>
      template({ fixed }, { shapeInstances: [shape], layerOrder: order });

    it('a photo under the text', () => {
      const photo = { id: 'panel', src: '/p.png', x: 0, y: 0.25, width: 1, height: 0.3 };
      const t = template({}, { userImageInstances: [photo, logo], layerOrder: order });
      const found = checkTemplate(t, context({ manifestPaths: new Set(['/p.png']) }));
      expect(found.map((p) => p.rule)).toEqual(['contrast']);
      expect(found[0]?.detail).toContain(NOT);
    });

    it.each([
      ['alpha in the fill', fixedFill({ fill: '#00000080' })],
      ['opacity below 1', fixedFill({ fill: '#000000', opacity: 0.5 })],
      [
        'a gradient',
        fixedFill({
          fill: '#000000',
          fillGradient: { stops: [{ color: '#000000' }, { color: '#ffffff' }] },
        }),
      ],
    ])('a shape with %s', (_name, shape) => {
      const found = checkTemplate(withShape(shape, { panel: ['fill', 'fillGradient'] }), context());
      expect(found.map((p) => p.rule)).toEqual(['contrast']);
      expect(found[0]?.detail).toContain(NOT);
    });

    it('text with opacity below 1, or a fill with alpha', () => {
      const dim = template({}, { additionalTexts: [{ ...headline, opacity: 0.5 }] });
      expect(rules(dim)).toEqual(['contrast']);
      const ghost = template(
        { fixed: { headline: ['fill'] } },
        { additionalTexts: [{ ...headline, fill: '#ffffff80', bind: undefined }] }
      );
      expect(rules(ghost)).toEqual(['contrast']);
    });

    it('a badge below the text, whose extent is unknown', () => {
      const badge = {
        id: 'badge',
        x: 0.1,
        y: 0.1,
        textColor: '#ffffff',
        backgroundColor: '#1d3557',
        fontSize: 0.03,
      };
      const t = template(
        { fixed: { badge: ['textColor', 'backgroundColor'] } },
        { pillBadgeInstances: [badge], layerOrder: ['badge', 'logo', 'headline'] }
      );
      expect(rules(t)).toEqual(['contrast']);
    });

    it('a badge text is held against the badge fill', () => {
      const badge = (textColor: string) => ({
        id: 'badge',
        x: 0.1,
        y: 0.1,
        textColor,
        backgroundColor: '#1d3557',
        fontSize: 0.03,
      });
      const make = (textColor: string) =>
        template(
          { fixed: { badge: ['textColor', 'backgroundColor'] } },
          { pillBadgeInstances: [badge(textColor)], layerOrder: ['logo', 'headline', 'badge'] }
        );
      expect(rules(make('#ffffff'))).toEqual([]);
      expect(rules(make('#2a4a70'))).toEqual(['contrast']);
    });

    it('a text missing from layerOrder', () => {
      const t = template({}, { layerOrder: ['logo'] });
      const found = checkTemplate(t, context());
      expect(found.map((p) => p.rule)).toEqual(['contrast']);
      expect(found[0]?.detail).toContain(NOT);
    });

    it('a text straddling two grounds', () => {
      const left = fixedFill({ id: 'left', width: 0.5, fill: '#000000' });
      const right = fixedFill({ id: 'right', x: 0.5, width: 0.5, fill: '#ffffff' });
      const t = template(
        { fixed: { left: ['fill'], right: ['fill'] } },
        { shapeInstances: [left, right], layerOrder: ['left', 'right', 'logo', 'headline'] }
      );
      const found = checkTemplate(t, context());
      expect(found.map((p) => p.rule)).toEqual(['contrast']);
      expect(found[0]?.detail).toContain(NOT);
    });

    it('a text wholly inside one of two grounds still decides', () => {
      const left = fixedFill({ id: 'left', width: 0.5, fill: '#000000' });
      const right = fixedFill({ id: 'right', x: 0.5, width: 0.5, fill: '#ffffff' });
      const t = template(
        { fixed: { left: ['fill'], right: ['fill'] } },
        {
          shapeInstances: [left, right],
          additionalTexts: [{ ...headline, width: 0.4 }],
          layerOrder: ['left', 'right', 'logo', 'headline'],
        }
      );
      expect(rules(t)).toEqual([]);
    });

    it('a text gradient is not judged by its flat fill', () => {
      const t = template(
        { fixed: { headline: ['fillGradient'] } },
        { additionalTexts: [{ ...headline, fillGradient: { stops: [] } }] }
      );
      const found = checkTemplate(t, context());
      expect(found.map((p) => p.rule)).toEqual(['contrast']);
      expect(found[0]?.detail).toContain('text gradient not checkable');
    });

    it.each(['white', 'hsl(0, 0%, 100%)'])(
      'an unparsable text colour (%s) has its own message',
      (fill) => {
        const t = template(
          { fixed: { headline: ['fill'] } },
          { additionalTexts: [{ ...headline, fill, bind: undefined }] }
        );
        const found = checkTemplate(t, context());
        expect(found.map((p) => p.rule)).toEqual(['contrast']);
        expect(found[0]?.detail).toContain('text colour not parseable');
      }
    );

    it('still decides on an opaque solid shape', () => {
      expect(rules(withShape(fixedFill({ fill: '#ffffff' })))).toEqual(['contrast']);
      expect(rules(withShape(fixedFill({ fill: '#000000' })))).toEqual([]);
    });
  });

  it('holds bold text to the large-text size from 18.67 px', () => {
    const grey = (extra: Obj) =>
      template(
        { fixed: { headline: ['fill'] } },
        {
          additionalTexts: [
            { ...headline, fontSize: 0.02, fill: '#7f93ad', bind: undefined, ...extra },
          ],
        }
      );
    expect(rules(grey({}))).toEqual(['contrast']);
    expect(rules(grey({ fontStyle: 'bold' }))).toEqual([]);
  });

  describe('layout extremes', () => {
    const low = { ...headline, id: 'low', y: 0.88, width: 0.7 };
    const slots = { low: { role: 'headline', budget: { maxLines: 1, maxChars: 60 } } };
    it('a text clear of the default logo box but not of the largest one', () => {
      const t = template({ logoCorners: ['bottom-right'] }, { additionalTexts: [low] });
      expect(rules(t, context({ slots }))).toEqual(['logo-overlap']);
    });
    it('sweeps the bounds of the layout, 30 × 12 percent at most', () => {
      const t = template(
        { logoCorners: ['bottom-right'] },
        { additionalTexts: [{ ...low, width: 0.6 }] }
      );
      expect(rules(t, context({ slots }))).toEqual([]);
    });
    it('sweeps only the corners the template declares', () => {
      const corner = { ...headline, id: 'low', x: 0, y: 0, width: 0.2 };
      const t = template({ logoCorners: ['bottom-right'] }, { additionalTexts: [corner] });
      expect(rules(t, context({ slots }))).toEqual([]);
    });
  });

  describe('texts the template has no slot for', () => {
    // 3 lines of 0.06 x 1080 x 1.2 px from y 0.85 leave the safe frame; one line does not.
    const note = (over: Obj = {}) => ({
      id: 'note',
      text: 'a',
      x: 0,
      y: 0.85,
      width: 0.5,
      fontSize: 0.06,
      fill: '#ffffff',
      bind: { fill: 'ink' },
      ...over,
    });
    const make = (n: Obj) =>
      template({}, { additionalTexts: [headline, n], layerOrder: ['logo', 'headline', 'note'] });

    it('are measured with the line count of their own text', () => {
      expect(rules(make(note()))).toEqual([]);
      expect(rules(make(note({ text: 'a\nb\nc' })))).toEqual(['bounds']);
    });

    it('fail bounds closed without a width', () => {
      const found = checkTemplate(make(note({ width: undefined })), context());
      expect(found.map((p) => p.rule)).toEqual(['bounds']);
      expect(found[0]?.detail).toContain('width unknown');
    });
  });

  it('checks every image source field the adapter lists', () => {
    const frame = (imageSrc: string) => ({
      id: 'frame',
      imageSrc,
      x: 0.4,
      y: 0.7,
      width: 0.1,
      height: 0.1,
    });
    expect(rules(template({}, { frameInstances: [frame('/nope.jpg')] }))).toEqual([
      'asset-licence',
    ]);
    expect(rules(template({}, { frameInstances: [frame('/ok.png')] }))).toEqual([]);
  });

  describe('assets named by id', () => {
    const picture = (source: string, illustrationId: string) => ({
      id: 'pic',
      source,
      illustrationId,
      x: 0.4,
      y: 0.5,
      scale: 1,
    });
    const withIllustration = (source: string, id = 'cat') =>
      template({}, { illustrationInstances: [picture(source, id)] });

    it('need an entry on the allowlist: a whole set by prefix', () => {
      expect(rules(withIllustration('kawaii'))).toEqual([]);
      const found = checkTemplate(withIllustration('gophers'), context());
      expect(found.map((p) => p.rule)).toEqual(['asset-licence']);
      expect(found[0]?.detail).toContain('illustration "gophers:cat"');
    });

    it('or one asset by exact id', () => {
      const icon = (iconId: string) =>
        template({}, { iconStates: { a: { iconId, x: 0.2, y: 0.5, scale: 1 } } });
      expect(rules(icon('tabler:tree'))).toEqual([]);
      expect(rules(icon('tabler:house'))).toEqual(['asset-licence']);
    });

    it('are refused when the context allows none of the kind', () => {
      expect(rules(withIllustration('kawaii'), context({ allowedAssets: {} }))).toEqual([
        'asset-licence',
      ]);
    });
  });

  describe('what the renderer draws', () => {
    it('a text with no font size fails bounds closed', () => {
      const found = checkTemplate(
        template({}, { additionalTexts: [{ ...headline, fontSize: undefined }] }),
        context()
      );
      expect(found.map((p) => p.rule)).toContain('bounds');
      expect(found.find((p) => p.rule === 'bounds')?.detail).toContain('font size unknown');
    });

    it('a text the adapter cannot place fails bounds closed with its reason', () => {
      const stub: GateAdapter = {
        ...adapter,
        text: (key, el) => {
          const base = adapter.text(key, el);
          return base && el['id'] === 'headline'
            ? { ...base, boundsProblem: 'rotated, not checkable' }
            : base;
        },
      };
      const found = checkTemplate(template(), context({ adapter: stub }));
      expect(found.map((p) => p.rule)).toEqual(['bounds']);
      expect(found[0]?.detail).toContain('rotated, not checkable');
    });

    it('a slotted text is measured by its placeholder too, not by maxLines alone', () => {
      const many = { ...headline, text: 'a\nb\nc\nd\ne\nf\ng', y: 0.7 };
      const t = template(
        { placeholders: { en: { headline: many.text } } },
        { additionalTexts: [many] }
      );
      // maxLines 1 would fit above the bottom edge; seven lines do not.
      const slots = { headline: { role: 'headline', budget: { maxLines: 1, maxChars: 60 } } };
      expect(rules(t, context({ slots }))).toContain('bounds');
    });

    it('an icon listed in selectedIcons needs an iconStates entry to be placed', () => {
      const t = template(
        {},
        { selectedIcons: ['tabler:tree'], iconStates: {}, layerOrder: ['logo', 'headline'] }
      );
      const found = checkTemplate(t, context());
      expect(found.map((p) => p.rule)).toEqual(['bounds']);
      expect(found[0]?.detail).toContain('tabler:tree');
      const ok = template(
        {},
        {
          selectedIcons: ['tabler:tree'],
          iconStates: { 'tabler:tree': { iconId: 'tabler:tree', x: 0.2, y: 0.5, scale: 1 } },
        }
      );
      expect(rules(ok)).toEqual([]);
    });
  });

  describe('every colour string is a colour', () => {
    const chip = (over: Obj) => ({ id: 'chip', x: 0.9, y: 0, width: 0.1, height: 0.05, ...over });
    it.each(['red', 'hsl(10, 50%, 50%)'])('%s on a shape is unbound', (fill) => {
      expect(rules(template({}, { shapeInstances: [chip({ fill })] }))).toEqual(['unbound-colour']);
    });
    it('nested colours need a fixed entry', () => {
      const gradient = { stops: [{ color: '#ff0000' }, { color: '#00ff00' }] };
      const shape = chip({ fill: '#ffffff', fillGradient: gradient });
      expect(rules(template({ fixed: { chip: ['fill'] } }, { shapeInstances: [shape] }))).toEqual([
        'unbound-colour',
      ]);
      expect(
        rules(template({ fixed: { chip: ['fill', 'fillGradient'] } }, { shapeInstances: [shape] }))
      ).toEqual([]);
      const accent = { ...headline, accent: { fill: '#ff0000' } };
      expect(rules(template({}, { additionalTexts: [accent] }))).toEqual(['unbound-colour']);
    });
  });

  it('lists a problem per brand, not only the first', () => {
    const t = template({}, { additionalTexts: [{ ...headline, y: 0 }] });
    const found = checkTemplate(
      t,
      context({ brands: [brandDefault, { ...brandDefault, id: 'other' }] })
    );
    expect(new Set(found.filter((p) => p.rule === 'logo-overlap').map((p) => p.brand))).toEqual(
      new Set(['default', 'other'])
    );
  });
});
