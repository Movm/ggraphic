// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { brandDefault } from '../brand/brandDefault.js';
import { offeredSchemes, type TemplateInput } from './instantiate.js';
import {
  checkTemplate,
  GATE_RULES,
  type GateAdapter,
  type GateCover,
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
  textExtent: (el) => ({ lines: 1, width: String(el['text']).length * 10 }),
  placeBox: (_key, el, box) => ({ ...el, ...box }),
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

  it('does not count emphasis markers against the word or character budget', () => {
    const slots = { headline: { role: 'headline', budget: { maxWords: 4, maxChars: 17 } } };
    const ok = context({ slots, placeholderTexts: { headline: 'Das ==Ziel== ist klar' } });
    expect(rules(template(), ok)).toEqual([]);
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

describe('fitted text sizes', () => {
  // A stand-in fitter: the text fits at 100 px or less; the floor is passed in with the request.
  const fitText: GateAdapter['fitText'] = (el, req) => {
    const max = num(el, 'maxFontSize');
    const floor = Math.min((3.5 * req.canvasHeight) / 100, max);
    const size = Math.max(floor, Math.min(max, 100));
    return { fontSize: size, fits: size <= 100 };
  };
  const fitting = (): GateContext => context({ adapter: { ...adapter, fitText } });
  const big = (extra: Obj) => ({
    additionalTexts: [{ ...headline, fontSize: 0.05, maxFontSize: 0.4, ...extra }],
  });

  it('judges a text at its fitted size: the same text fails at its fixed prototype size', () => {
    const fixed = template({}, { additionalTexts: [{ ...headline, fontSize: 0.4 }] });
    expect(rules(fixed, fitting())).toContain('bounds');
    expect(checkTemplate(template({}, big({})), fitting())).toEqual([]);
  });

  it('fails a text that does not fit even at the floor', () => {
    const never: GateAdapter['fitText'] = (el, req) => ({
      fontSize: Math.min((3.5 * req.canvasHeight) / 100, num(el, 'maxFontSize')),
      fits: false,
    });
    const problems = checkTemplate(
      template({}, big({})),
      context({ adapter: { ...adapter, fitText: never } })
    );
    expect(problems.map((p) => p.rule)).toContain('bounds');
    expect(problems.map((p) => p.detail).join()).toContain('minimum size');
  });

  it('asks the fitter with the slot budget and the canvas height', () => {
    const seen: unknown[] = [];
    const spy: GateAdapter['fitText'] = (el, req) => {
      seen.push(req);
      return fitText(el, req);
    };
    checkTemplate(template({}, big({})), context({ adapter: { ...adapter, fitText: spy } }));
    expect(seen[0]).toMatchObject({ maxLines: 2, canvasHeight: 1080 });
  });
});

describe('contrast over photos, veils and shades', () => {
  /** The stand-in adapter, plus the photo, veil and shade grounds an editor reports. */
  const grounds: GateAdapter = {
    ...adapter,
    cover: (key, el, width) => {
      if (key === 'userImageInstances') {
        return {
          kind: 'photo',
          low: String(el['duotoneLow'] ?? '#000000'),
          high: String(el['duotoneHigh'] ?? '#ffffff'),
        };
      }
      if (key === 'shapeInstances') {
        if (el['shade']) {
          return { kind: 'shade', fill: String(el['fill']), direction: el['shade'] as 'bottom' };
        }
        if (num(el, 'opacity', 1) < 1) {
          return { kind: 'veil', fill: String(el['fill']), alpha: num(el, 'opacity', 1) };
        }
      }
      return adapter.cover(key, el, width);
    },
  };
  const ctx = () => context({ adapter: grounds, manifestPaths: new Set(['/p.png']) });
  const photo = (over: Obj = {}) => ({
    id: 'pic',
    src: '/p.png',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    ...over,
  });
  const black = (over: Obj) => ({ id: 'veil', fill: '#000000', x: 0, y: 0, width: 1, ...over });
  const build = (
    shapes: Obj[],
    pic: Obj | null,
    textY: number,
    textFill = '#ffffff',
    fontSize = 0.06
  ) =>
    template(
      { fixed: { headline: ['fill'], veil: ['fill'] } },
      {
        shapeInstances: shapes,
        userImageInstances: pic ? [pic, logo] : [logo],
        additionalTexts: [{ ...headline, y: textY, fill: textFill, fontSize, bind: undefined }],
        layerOrder: [
          pic ? 'pic' : '',
          ...shapes.map((s) => String(s['id'])),
          'logo',
          'headline',
        ].filter(Boolean),
      }
    );
  const details = (t: TemplateInput) =>
    checkTemplate(t, ctx()).map((p) => `${p.rule}: ${p.detail}`);

  it('white text fully inside a bottom shade of #000000 over a photo passes where alpha is high enough', () => {
    const t = build([black({ height: 1, shade: 'bottom' })], photo(), 0.8);
    expect(details(t)).toEqual([]);
  });

  it('the same text placed in the thin top part of the shade fails and names the worst ground', () => {
    const t = build([black({ height: 1, shade: 'bottom' })], photo(), 0.3);
    const found = details(t);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^contrast: headline: #ffffff on #9a9a9a is 2\.82, needs 3$/);
  });

  it('white text on an untreated photo with no overlay fails (worst ground #ffffff)', () => {
    const found = details(build([], photo(), 0.5));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('#ffffff on #ffffff');
  });

  it('text on a duotone photo is judged against the duotone range, not black/white', () => {
    const dark = photo({ duotoneLow: '#0b1d12', duotoneHigh: '#2a5a3a' });
    expect(details(build([], dark, 0.5))).toEqual([]);
    const light = photo({ duotoneLow: '#0b1d12', duotoneHigh: '#e8f5ec' });
    expect(details(build([], light, 0.5))).toHaveLength(1);
  });

  it('a veil (shape opacity 0.35, fill #000000) over a duotone photo darkens every candidate', () => {
    const duo = photo({ duotoneLow: '#4a4a4a', duotoneHigh: '#a0a0a0' });
    // Without the veil the lightest candidate #a0a0a0 is too bright for white text.
    expect(details(build([], duo, 0.5))).toHaveLength(1);
    const veiled = build([black({ height: 1, opacity: 0.35 })], duo, 0.5);
    expect(details(veiled)).toEqual([]);
  });

  it('a shade or veil that covers only part of the text box fails as two grounds', () => {
    // The text box spans y 0.3..0.37; the veil ends at 0.33.
    const t = build([black({ height: 0.33, opacity: 0.9 })], photo(), 0.3);
    const found = details(t);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('ground not determinable');
  });

  it('a photo that covers only part of the text box fails', () => {
    const t = build([], photo({ height: 0.33 }), 0.3, '#000000');
    expect(details(t)[0]).toContain('ground not determinable');
  });

  it('a veil over a solid ground is composited onto its colour', () => {
    // A light page under a 0.5 black veil: the ground is #808080 and white text just fails 4.5.
    const t = template(
      { fixed: { headline: ['fill'], veil: ['fill'], page: ['backgroundColor'] } },
      {
        backgroundColor: '#ffffff',
        bind: undefined,
        shapeInstances: [black({ height: 1, opacity: 0.5 })],
        additionalTexts: [{ ...headline, fontSize: 0.02, y: 0.5, bind: undefined }],
        layerOrder: ['veil', 'logo', 'headline'],
      }
    );
    expect(details(t)).toEqual(['contrast: headline: #ffffff on #808080 is 3.95, needs 4.5']);
  });

  it('judges the duotone ramp, not the segment between its colours (review counterexample 1)', () => {
    // high is below low in the red channel: the brightest pixel is #c800ff, not #0000ff.
    const duo = photo({ duotoneLow: '#c80000', duotoneHigh: '#0000ff' });
    const found = details(build([], duo, 0.5, '#ffffff', 0.02));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('#ffffff on #c800ff is 4.29, needs 4.5');
  });

  it('judges dark text against the darkest row of a shade (review counterexample 2)', () => {
    const duo = photo({ duotoneLow: '#d0d0d0', duotoneHigh: '#ffffff' });
    // The text box spans t 0.30..0.52 of the shade: alpha 0.40..0.69, so its bottom row is much darker.
    const t = build([black({ y: 0.2, height: 0.3333, shade: 'bottom' })], duo, 0.3, '#1a1a1a');
    const found = details(t);
    // One finding per layout (the text box differs a little in each), all against dark rows.
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) expect(f).toMatch(/^contrast: headline: #1a1a1a on #[0-9a-f]{6}/);
  });

  it('fails at contrast 1 when the text luminance lies inside a shade interval', () => {
    const t = template(
      { fixed: { headline: ['fill'], veil: ['fill'], page: ['backgroundColor'] } },
      {
        backgroundColor: '#ffffff',
        bind: undefined,
        shapeInstances: [black({ height: 1, shade: 'bottom' })],
        additionalTexts: [{ ...headline, y: 0.5, fill: '#494949', bind: undefined }],
        layerOrder: ['veil', 'logo', 'headline'],
      }
    );
    const found = details(t);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("the ground can match the text's luminance (contrast 1)");
  });

  it('composites stacked veils with different fills bottom-up', () => {
    const t = template(
      { fixed: { headline: ['fill'], low: ['fill'], high: ['fill'], page: ['backgroundColor'] } },
      {
        backgroundColor: '#ffffff',
        bind: undefined,
        shapeInstances: [
          black({ id: 'low', height: 1, opacity: 0.3 }),
          black({ id: 'high', fill: '#ff0000', height: 1, opacity: 0.3 }),
        ],
        additionalTexts: [{ ...headline, fontSize: 0.02, y: 0.5, bind: undefined }],
        layerOrder: ['low', 'high', 'logo', 'headline'],
      }
    );
    // black 0.3 on white gives #b3b3b3, then red 0.3 gives #ca7d7d (the reverse order: #b37d7d).
    expect(details(t)).toEqual(['contrast: headline: #ffffff on #ca7d7d is 3.12, needs 4.5']);
  });

  it('uses the interior luminance minimum of a coloured shade, not only its end values', () => {
    // Green page under a red bottom shade: the red channel rises while the green one falls, so
    // luminance dips to about 0.152 inside the span, below both ends (about 0.65 and 0.189).
    const t = template(
      { fixed: { headline: ['fill'], veil: ['fill'], page: ['backgroundColor'] } },
      {
        backgroundColor: '#00ff00',
        bind: undefined,
        shapeInstances: [black({ fill: '#ff0000', y: 0.3, height: 0.7, shade: 'bottom' })],
        additionalTexts: [
          { ...headline, y: 0.3, fontSize: 0.1944, fill: '#727272', bind: undefined },
        ],
        layerOrder: ['veil', 'logo', 'headline'],
      }
    );
    const found = details(t);
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) expect(f).toContain("the ground can match the text's luminance");
  });

  it('does not judge two shades over one text', () => {
    const t = template(
      { fixed: { headline: ['fill'], a: ['fill'], b: ['fill'], page: ['backgroundColor'] } },
      {
        backgroundColor: '#ffffff',
        bind: undefined,
        shapeInstances: [
          black({ id: 'a', height: 1, shade: 'bottom' }),
          black({ id: 'b', height: 1, shade: 'bottom' }),
        ],
        additionalTexts: [{ ...headline, y: 0.8, bind: undefined }],
        layerOrder: ['a', 'b', 'logo', 'headline'],
      }
    );
    const found = details(t);
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) expect(f).toContain('ground not determinable (stacked shades)');
  });

  it('a shade span that contains a stop is judged over its whole alpha range', () => {
    // Text over t 0.5..0.644 of a bottom shade crosses the 0.62 stop: alpha 0.66..0.82 on white.
    const t = template(
      { fixed: { headline: ['fill'], veil: ['fill'], page: ['backgroundColor'] } },
      {
        backgroundColor: '#ffffff',
        bind: undefined,
        shapeInstances: [black({ height: 1, shade: 'bottom' })],
        additionalTexts: [{ ...headline, y: 0.5, fontSize: 0.12, bind: undefined }],
        layerOrder: ['veil', 'logo', 'headline'],
      }
    );
    expect(details(t)).toEqual([]);
  });
});

describe('decorative text (a ghost numeral)', () => {
  /** A huge, translucent numeral that bleeds off the page. */
  const ghost = (over: Obj = {}) => ({
    id: 'ghost',
    text: '5',
    x: -0.2,
    y: 0.1,
    width: 1.4,
    fontSize: 0.8,
    fill: '#ffffff',
    opacity: 0.15,
    bind: { fill: 'ink' },
    ...over,
  });
  const withGhost = (g: Obj, headlineOver: Obj = {}, state: Obj = {}) =>
    template(
      { fixed: { headline: ['fill'], ghost: ['fill'], page: ['backgroundColor'] } },
      {
        backgroundColor: '#000000',
        bind: undefined,
        additionalTexts: [g, { ...headline, bind: undefined, ...headlineOver }],
        layerOrder: ['ghost', 'logo', 'headline'],
        ...state,
      }
    );

  it('passes with opacity 0.15, a bleed off the page and no contrast of its own', () => {
    expect(checkTemplate(withGhost(ghost({ decorative: true })), context())).toEqual([]);
  });

  it('fails the same text without the flag', () => {
    // Within 0..1 so that it is placed at all: a bleed beyond the page is refused without the flag.
    const inPage = { x: 0, width: 1 };
    const found = rules(withGhost(ghost(inPage)));
    expect(found).toContain('contrast');
    expect(found).toContain('bounds');
    expect(rules(withGhost(ghost({ ...inPage, decorative: true })))).toEqual([]);
    expect(rules(withGhost(ghost()))).toEqual(['schema']);
  });

  it('is judged as a translucent layer under a real headline: a faint ghost passes', () => {
    // White at 0.15 on black is #262626; white text on it still reads.
    expect(checkTemplate(withGhost(ghost({ decorative: true })), context())).toEqual([]);
  });

  it('is judged as a translucent layer under a real headline: a strong ghost fails', () => {
    // White at 0.6 on black is #999999; white text on that is 2.8, large text needs 3.
    const found = checkTemplate(withGhost(ghost({ decorative: true, opacity: 0.6 })), context());
    expect(found.map((p) => p.rule)).toEqual(['contrast']);
    expect(found[0]?.detail).toMatch(/^headline: #ffffff on #999999 is 2\.8/);
  });

  it('only counts where its box meets the headline', () => {
    const away = ghost({ decorative: true, opacity: 0.6, y: 0.6, fontSize: 0.2 });
    expect(checkTemplate(withGhost(away), context())).toEqual([]);
  });

  it('a ghost of unknown extent or colour fails the headline closed', () => {
    const found = checkTemplate(
      withGhost(ghost({ decorative: true, fill: '#ffffff80', bind: undefined }), {}, {}),
      context({})
    );
    expect(found.map((p) => p.rule)).toContain('contrast');
  });

  it('stacks with a shade: the ghost is a choice of present or absent, not a shade alpha', () => {
    const grounds: GateAdapter = {
      ...adapter,
      cover: (key, el, width) =>
        key === 'shapeInstances'
          ? { kind: 'shade', fill: String(el['fill']), direction: 'bottom' }
          : adapter.cover(key, el, width),
    };
    const build = (g: Obj) =>
      template(
        { fixed: { headline: ['fill'], veil: ['fill'], page: ['backgroundColor'] } },
        {
          backgroundColor: '#ffffff',
          bind: undefined,
          shapeInstances: [{ id: 'veil', fill: '#000000', x: 0, y: 0, width: 1, height: 1 }],
          additionalTexts: [g, { ...headline, y: 0.8, bind: undefined }],
          layerOrder: ['veil', 'ghost', 'logo', 'headline'],
        }
      );
    const details = (t: TemplateInput) =>
      checkTemplate(t, context({ adapter: grounds })).map((p) => `${p.rule}: ${p.detail}`);
    expect(details(build(ghost({ decorative: true, opacity: 0.1, fill: '#000000' })))).toEqual([]);
    expect(details(build(ghost({ decorative: true, opacity: 0.9 })))[0]).toMatch(
      /^contrast: headline: #ffffff on #/
    );
  });

  it('is not limited by the slot checks: it has no slot and is no budget', () => {
    expect(checkTemplate(withGhost(ghost({ decorative: true })), context({ slots: {} }))).toEqual(
      []
    );
  });
});

describe('contrast over notched, glow and grain grounds', () => {
  /** The stand-in adapter, plus the covers an editor reports for a notch, glow, grain and dots. */
  const devices: GateAdapter = {
    ...adapter,
    cover: (key, el, canvasWidth) => {
      if (key !== 'shapeInstances') return adapter.cover(key, el, canvasWidth);
      const n = num(el, 'notch') * canvasWidth;
      const mods: Omit<GateCover, 'kind'> = {
        ...(n > 0
          ? {
              cut: {
                x: num(el, 'x') + num(el, 'width') - n,
                y: num(el, 'y'),
                width: n,
                height: n,
              },
            }
          : {}),
        ...(el['pattern'] === 'dots' ? { dots: true as const } : {}),
        ...(el['stripeFill'] ? { stripes: String(el['stripeFill']) } : {}),
        ...(el['grainFill']
          ? {
              grain: {
                fill: String(el['grainFill']),
                alpha: [0, num(el, 'grainMax')] as [number, number],
              },
            }
          : {}),
      };
      const fill = String(el['fill']);
      if (el['veilAlpha'] !== undefined) {
        return { kind: 'veil', fill, alpha: num(el, 'veilAlpha'), ...mods };
      }
      return el['glowMax'] !== undefined
        ? { kind: 'range', fill, alpha: [0, num(el, 'glowMax')], ...mods }
        : { kind: 'solid', fill, ...mods };
    },
  };
  const panel = (over: Obj = {}) => ({
    id: 'panel',
    fill: '#000000',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    ...over,
  });
  const build = (shape: Obj, text: Obj = {}) =>
    template(
      { fixed: { headline: ['fill'], panel: ['fill'] } },
      {
        shapeInstances: [shape],
        additionalTexts: [{ ...headline, y: 0.5, fontSize: 0.03, bind: undefined, ...text }],
        layerOrder: ['panel', 'logo', 'headline'],
      }
    );
  const details = (t: TemplateInput) =>
    checkTemplate(t, context({ adapter: devices })).map((p) => `${p.rule}: ${p.detail}`);
  // A narrow text high up at the right edge: wholly inside a 0.1 notch (108 px of 1080).
  const inCut = { x: 0.9, y: 0.01, width: 0.08, fontSize: 0.02 };

  it('text on a notched panel away from the notch passes like on an un-notched one', () => {
    expect(details(build(panel({ notch: 0.1 })))).toEqual([]);
    expect(details(build(panel()))).toEqual([]);
  });

  it('text on a notched light panel away from the notch fails like on an un-notched one', () => {
    const light = panel({ fill: '#ffffff', notch: 0.1 });
    expect(details(build(light))[0]).toContain('#ffffff on #ffffff');
  });

  it('text wholly inside the cut is judged against what lies beneath the panel', () => {
    // The page is black: white text in the cut passes, though the panel is white.
    const t = build(panel({ fill: '#ffffff', notch: 0.1 }), inCut);
    expect(details(t)).toEqual([]);
    expect(details(build(panel({ fill: '#ffffff' }), inCut))[0]).toContain('#ffffff on #ffffff');
  });

  it('text half in the cut fails closed', () => {
    const t = build(panel({ fill: '#ffffff', notch: 0.1 }), { ...inCut, x: 0.8, width: 0.15 });
    expect(details(t)[0]).toContain('ground not determinable');
  });

  it('judges a glow as an alpha range of its fill: dark glow passes, light glow fails', () => {
    expect(details(build(panel({ glowMax: 0.9 })))).toEqual([]);
    const light = details(build(panel({ fill: '#ffffff', glowMax: 0.9 })));
    expect(light).toHaveLength(1);
    expect(light[0]).toMatch(/^contrast: headline: #ffffff on #/);
  });

  it('judges grain as an alpha range of black or white over the ground', () => {
    const ok = panel({ fill: '#000000', grainFill: '#ffffff', grainMax: 0.2 });
    expect(details(build(ok))).toEqual([]);
    const bad = panel({ fill: '#000000', grainFill: '#ffffff', grainMax: 0.8 });
    expect(details(build(bad))[0]).toMatch(/^contrast: headline: #ffffff on #/);
  });

  it('fails closed on a grain layer under a second alpha range', () => {
    const t = build(panel({ grainFill: '#ffffff', grainMax: 0.2, glowMax: 0.5 }));
    expect(details(t)[0]).toContain('stacked shades');
  });

  it('judges a text on stripes against the stripe colour as well as the ground', () => {
    // White text: the black ground passes, a white stripe fails it, a dark one passes.
    expect(details(build(panel({ stripeFill: '#222222' })))).toEqual([]);
    const bad = details(build(panel({ stripeFill: '#ffffff' })));
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/^contrast: headline: #ffffff on #/);
    expect(details(build(panel({ stripeFill: '#ffffff', height: 0.3 })))).toEqual([]);
  });

  it('judges stripes over a translucent fill: the band is the fill, then the stripe colour', () => {
    // Mostly opaque black over a black page, a white stripe on top: the band is near white.
    const veil = panel({ veilAlpha: 0.9 });
    expect(details(build(veil))).toEqual([]);
    expect(details(build({ ...veil, stripeFill: '#222222' }))).toEqual([]);
    const bad = details(build({ ...veil, stripeFill: '#ffffff' }));
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/^contrast: headline: #ffffff on #/);
  });

  it('a dot pattern fails a text lying on it and leaves a text off it alone', () => {
    expect(details(build(panel({ pattern: 'dots' })))[0]).toContain('ground not determinable');
    expect(details(build(panel({ pattern: 'dots', height: 0.3 })))).toEqual([]);
  });
});

describe('contrast over a ground with bare edges (inner box)', () => {
  /** The stand-in adapter, plus a cover whose sure ground is the panel shrunk by `inset` px. */
  const rounded: GateAdapter = {
    ...adapter,
    cover: (key, el, canvasWidth) => {
      if (key !== 'shapeInstances') return adapter.cover(key, el, canvasWidth);
      const inset = num(el, 'inset');
      return {
        kind: 'solid',
        fill: String(el['fill']),
        inner: {
          x: num(el, 'x') + inset,
          y: num(el, 'y') + inset,
          width: num(el, 'width') - 2 * inset,
          height: num(el, 'height') - 2 * inset,
        },
      };
    },
  };
  const build = (panel: Obj, text: Obj) =>
    template(
      { fixed: { headline: ['fill'], panel: ['fill'] } },
      {
        shapeInstances: [
          { id: 'panel', fill: '#000000', x: 0, y: 0, width: 1, height: 1, ...panel },
        ],
        additionalTexts: [{ ...headline, y: 0.5, fontSize: 0.03, bind: undefined, ...text }],
        layerOrder: ['panel', 'logo', 'headline'],
      }
    );
  const details = (t: TemplateInput) =>
    checkTemplate(t, context({ adapter: rounded })).map((p) => `${p.rule}: ${p.detail}`);

  it('judges a text wholly inside the inner box against the ground', () => {
    expect(details(build({ inset: 100 }, { x: 0.4, width: 0.2 }))).toEqual([]);
    const light = details(build({ inset: 100, fill: '#ffffff' }, { x: 0.4, width: 0.2 }));
    expect(light[0]).toContain('#ffffff on #ffffff');
  });

  it('fails closed on a text in the panel but outside the inner box', () => {
    // On the bare edge the text sits on whatever lies beneath, so even a passing ground is not enough.
    const edge = details(build({ inset: 100 }, { x: 0.01, width: 0.05 }));
    expect(edge[0]).toContain('ground not determinable');
  });

  it('leaves a cover without an inner box judged by the whole panel as before', () => {
    expect(details(build({ inset: 0 }, { x: 0.01, width: 0.05 }))).toEqual([]);
  });
});

describe('plates that hug their text', () => {
  const hugged = (plateY: number, hug: boolean) =>
    template(
      {
        frames: { headline: 'canvas', plate: 'canvas' },
        fixed: { headline: ['fill'], plate: ['fill'] },
      },
      {
        backgroundColor: '#ffffff',
        bind: undefined,
        additionalTexts: [
          {
            ...headline,
            x: 0.1,
            y: plateY,
            width: 0.5,
            fontSize: 0.03,
            fill: '#ffffff',
            bind: undefined,
          },
        ],
        shapeInstances: [
          {
            id: 'plate',
            type: 'rect',
            x: 0.05,
            y: plateY - 0.01,
            width: 0.6,
            height: 0.04,
            fill: '#000000',
            rotation: 0,
            ...(hug ? { hug: { text: 'headline', padX: 0.01, padY: 0.01 } } : {}),
          },
        ],
      }
    );
  const threeLines = () =>
    context({
      slots: { headline: { role: 'headline', budget: { maxWords: 8, maxLines: 3, maxChars: 60 } } },
    });
  const only = (t: TemplateInput, ctx: GateContext, rule: GateRule) =>
    checkTemplate(t, ctx).filter((p) => p.rule === rule);

  it('judges the text against the plate hugged to the lines the slot allows', () => {
    // The text box is three lines tall; the fixed plate is one line tall and holds only part of it.
    expect(only(hugged(0.5, false), threeLines(), 'contrast')).not.toEqual([]);
    expect(only(hugged(0.5, true), threeLines(), 'contrast')).toEqual([]);
  });

  it('fails bounds for a plate that would leave the canvas once hugged', () => {
    // Three lines (about 117 px) plus padding from y = 0.93 of 1080 run past the bottom edge.
    expect(only(hugged(0.5, true), threeLines(), 'bounds')).toEqual([]);
    expect(only(hugged(0.93, true), threeLines(), 'bounds').map((p) => p.detail)).toEqual(
      expect.arrayContaining([expect.stringContaining('plate leaves')])
    );
  });
});
