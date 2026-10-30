// SPDX-License-Identifier: MPL-2.0
import { createRequire } from 'node:module';

import type KonvaNs from 'konva';
import type * as NapiCanvas from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import { buildPptxModel } from '../../export/pptx/buildPptxModel.js';
import { pptxUnits } from '../../export/pptx/pptxUnits.js';
import { textRuns } from '../../export/pptx/writeText.js';
import { createRunMeasurer } from '../textUtils.js';

import { PLAIN_STYLE } from '@ggraphic/schema';

import type { CanvasFormat } from '../../formats/index.js';
import type { PptxTextItem } from '../../export/pptx/types.js';

const req = createRequire(import.meta.url);
const { createCanvas } = req('@napi-rs/canvas') as typeof NapiCanvas;
const konvaModule = req('konva/lib/index.js') as { default?: unknown };
const Konva = (konvaModule.default ?? konvaModule) as typeof KonvaNs;
Konva.Util.createCanvasElement = () => {
  const canvas = createCanvas(300, 150) as unknown as HTMLCanvasElement;
  (canvas as unknown as { style: object }).style = {};
  return canvas;
};

const PLAIN = PLAIN_STYLE;
// A fixed 50 px per glyph at 100 px: the base width is exact, the spacing is the only variable.
const glyphs = (text: string) => [...text].length * 50;

describe('letter-spacing in the run measurer', () => {
  const measure = (letterSpacing?: number) =>
    createRunMeasurer(glyphs, 100, 'Raleway', 'normal', null, null, letterSpacing);

  it('adds letterSpacing (em) x fontSize after every glyph', () => {
    expect(measure()('ABCD', PLAIN)).toBe(200);
    expect(measure(0.1)('ABCD', PLAIN)).toBe(200 + 4 * 10);
    expect(measure(-0.05)('ABCD', PLAIN)).toBe(200 - 4 * 5);
  });

  it('counts code points, as Konva does', () => {
    expect(measure(0.1)('A😀', PLAIN)).toBe(100 + 2 * 10);
  });

  it('is what Konva does: spacing after every glyph, the last one included', () => {
    const plain = new Konva.Text({ text: 'ABCD', fontSize: 100, fontFamily: 'sans-serif' });
    const spaced = new Konva.Text({
      text: 'ABCD',
      fontSize: 100,
      fontFamily: 'sans-serif',
      letterSpacing: 0.1 * 100,
    });
    expect(spaced.width() - plain.width()).toBeCloseTo(4 * 10, 6);
  });
});

describe('letter-spacing in the PPTX export', () => {
  it('writes charSpacing (spc) = letterSpacing x font size in points', () => {
    const format = { width: 1080, height: 1350 } as unknown as CanvasFormat;
    const text = {
      id: 't1',
      text: 'LABEL',
      type: 'body',
      x: 0,
      y: 0,
      width: 400,
      fontSize: 26,
      fontFamily: 'Instrument Sans',
      fill: '#000000',
    };
    const build = (extra: object) =>
      buildPptxModel([{ additionalTexts: [{ ...text, ...extra }] }], format).slides[0]!
        .items[0] as PptxTextItem;
    const units = pptxUnits(1080);
    const spaced = textRuns(build({ letterSpacing: 0.08 }), units)[0]!;
    expect(spaced.options?.charSpacing).toBeCloseTo(0.08 * units.pt(26), 9);
    expect(textRuns(build({}), units)[0]!.options?.charSpacing).toBeUndefined();
  });
});
