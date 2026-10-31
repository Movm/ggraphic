// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { brandDefault } from '../brand/brandDefault.js';
import { hugPlates, type HugAdapter } from './hug.js';
import { instantiateTemplatePage, type TemplateInput } from './instantiate.js';

type Obj = Record<string, unknown>;
const num = (el: Obj, k: string, d = 0) => (typeof el[k] === 'number' ? (el[k] as number) : d);

/** Ten px per character; a text wraps at its width. Plates are top-left boxes here. */
const adapter: HugAdapter = {
  box: (key, el, lines) =>
    key === 'additionalTexts'
      ? {
          x: num(el, 'x'),
          y: num(el, 'y'),
          width: num(el, 'width'),
          height: num(el, 'fontSize') * 1.2 * lines,
        }
      : { x: num(el, 'x'), y: num(el, 'y'), width: num(el, 'width'), height: num(el, 'height') },
  textExtent: (el) => {
    const len = String(el['text']).length;
    const perLine = Math.max(1, Math.floor(num(el, 'width') / 10));
    return { lines: Math.max(1, Math.ceil(len / perLine)), width: Math.min(len, perLine) * 10 };
  },
  placeBox: (_key, el, box) => ({ ...el, ...box }),
};

const text = (over: Obj = {}): Obj => ({
  id: 'h',
  text: 'abcde',
  x: 100,
  y: 200,
  width: 200,
  fontSize: 20,
  ...over,
});
const plate = (hug: Obj = {}): Obj => ({
  id: 'h-plate',
  type: 'rect',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  rotation: 0,
  hug: { text: 'h', padX: 10, padY: 8, ...hug },
});
const page = (t: Obj, p: Obj): Obj => ({ additionalTexts: [t], shapeInstances: [p] });
const plateOf = (state: Obj) => (state['shapeInstances'] as Obj[])[0]!;

describe('hugPlates', () => {
  it('sizes the plate to the text lines plus the padding', () => {
    const out = plateOf(hugPlates(page(text(), plate()), adapter));
    expect(out).toMatchObject({ x: 90, y: 192, width: 220, height: 24 + 16 });
  });

  it('grows by one line height when the text wraps to one more line, and shrinks back', () => {
    const one = page(text({ width: 100, text: 'abcdefghij' }), plate());
    const two = page(text({ width: 100, text: 'abcdefghijk' }), plate());
    const h1 = plateOf(hugPlates(one, adapter))['height'] as number;
    const grown = hugPlates(two, adapter);
    expect(plateOf(grown)['height']).toBe(h1 + 24);
    // The top stays on the text's top minus the padding.
    expect(plateOf(grown)['y']).toBe(192);
    const back = hugPlates(
      { ...grown, additionalTexts: [text({ width: 100, text: 'abcdefghij' })] },
      adapter
    );
    expect(plateOf(back)['height']).toBe(h1);
  });

  it('grows with a bigger font size', () => {
    const small = plateOf(hugPlates(page(text({ fontSize: 20 }), plate()), adapter));
    const big = plateOf(hugPlates(page(text({ fontSize: 40 }), plate()), adapter));
    expect(big['height']).toBe((small['height'] as number) + 24);
  });

  it("width 'box' spans the text box plus the padding on both sides", () => {
    const out = plateOf(hugPlates(page(text({ text: 'ab' }), plate({ width: 'box' })), adapter));
    expect(out).toMatchObject({ x: 90, width: 220 });
  });

  describe("width 'text'", () => {
    const wide = (align: string | undefined) =>
      plateOf(
        hugPlates(
          page(text({ text: 'abcde', ...(align ? { align } : {}) }), plate({ width: 'text' })),
          adapter
        )
      );

    it('left-aligned: starts at the text box minus the padding', () => {
      expect(wide(undefined)).toMatchObject({ x: 90, width: 50 + 20 });
    });
    it('centred: centred on the text box', () => {
      expect(wide('center')).toMatchObject({ x: 100 + 100 - 35, width: 70 });
    });
    it('right-aligned: ends at the text box plus the padding', () => {
      expect(wide('right')).toMatchObject({ x: 100 + 200 + 10 - 70, width: 70 });
    });
    it('follows the measured line width', () => {
      const out = plateOf(
        hugPlates(page(text({ text: 'abcdefgh' }), plate({ width: 'text' })), adapter)
      );
      expect(out['width']).toBe(80 + 20);
    });
  });

  it('spans several texts: from the top of the first to the bottom of the last', () => {
    const state = {
      additionalTexts: [
        text({ id: 'a', y: 100, text: 'ab' }),
        text({ id: 'b', y: 160, x: 120, width: 100, text: 'abcdefghijk' }),
      ],
      shapeInstances: [plate({ text: ['a', 'b'] })],
    };
    // a: 100..124; b: two lines, 160..208; x from 100 to 300.
    expect(plateOf(hugPlates(state, adapter))).toMatchObject({
      x: 90,
      y: 92,
      width: 220,
      height: 208 - 100 + 16,
    });
  });

  it('is idempotent and returns the same page when nothing moves', () => {
    const once = hugPlates(page(text(), plate()), adapter);
    expect(hugPlates(once, adapter)).toBe(once);
  });

  it('leaves a page without hug exactly as it is', () => {
    const { hug: _hug, ...bare } = plate() as Obj;
    const state = page(text(), bare);
    expect(hugPlates(state, adapter)).toBe(state);
  });

  it('leaves a plate alone whose text is missing or whose plate is turned', () => {
    const missing = page(text({ id: 'other' }), plate());
    expect(hugPlates(missing, adapter)).toBe(missing);
    const turned = page(text(), { ...plate(), rotation: 10 });
    expect(hugPlates(turned, adapter)).toBe(turned);
  });

  it('can be asked for at least some lines (the gate hugs the worst case)', () => {
    const out = plateOf(hugPlates(page(text(), plate()), adapter, { minLines: () => 3 }));
    expect(out['height']).toBe(72 + 16);
  });
});

describe('hug in a placed template', () => {
  const geometry = {
    additionalTexts: { x: 'x', y: 'y', width: 'w', fontSize: 's', maxFontSize: 's' },
    shapeInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
  } as const;
  const t: TemplateInput = {
    id: 't',
    version: 1,
    formats: ['1:1'],
    schemes: ['primary'],
    frames: { h: 'canvas', 'h-plate': 'canvas' },
    pages: [
      {
        state: {
          additionalTexts: [
            {
              id: 'h',
              text: 'abcde',
              x: 0.1,
              y: 0.1,
              width: 0.5,
              fontSize: 0.02,
              maxFontSize: 0.04,
            },
          ],
          shapeInstances: [
            {
              id: 'h-plate',
              type: 'rect',
              x: 0,
              y: 0,
              width: 0.1,
              height: 0.1,
              rotation: 0,
              hug: { text: 'h', padX: 0.01, padY: 0.01 },
            },
          ],
        },
      },
    ],
  };
  const place = (fitSize: number) =>
    instantiateTemplatePage(t, {
      brand: brandDefault,
      canvas: { width: 1000, height: 1000 },
      format: '1:1',
      geometry,
      fitText: () => ({ fontSize: fitSize, fits: true }),
      boxOf: (k, e) => adapter.box(k, e, 1),
      hug: adapter,
    });

  it('scales the padding like other geometry and hugs the fitted size', () => {
    const a = place(40);
    const b = place(80);
    if (!a.ok || !b.ok) throw new Error('refused');
    // 40 px font: 48 px line + 2 × 10 px padding; 80 px: 96 + 20.
    expect(plateOf(a.state)).toMatchObject({ y: 90, height: 48 + 20, x: 90, width: 500 + 20 });
    expect(plateOf(b.state)['height']).toBe(96 + 20);
  });

  it('places without hugging when no adapter is given', () => {
    const r = instantiateTemplatePage(t, {
      brand: brandDefault,
      canvas: { width: 1000, height: 1000 },
      format: '1:1',
      geometry,
    });
    if (!r.ok) throw new Error('refused');
    expect(plateOf(r.state)['height']).toBe(100);
  });
});
