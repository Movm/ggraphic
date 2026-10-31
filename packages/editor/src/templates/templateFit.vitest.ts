// SPDX-License-Identifier: MPL-2.0
import { minTextSizePx } from '@ggraphic/core';
import { describe, expect, it } from 'vitest';

import { TEMPLATE_GATE_ADAPTER, TEMPLATE_GEOMETRY } from './templateGeometry.js';

const fit = TEMPLATE_GATE_ADAPTER.fitText!;
const text = (over: Record<string, unknown> = {}) => ({
  id: 'h',
  text: 'Gute Nachrichten heute',
  width: 900,
  fontSize: 60,
  maxFontSize: 400,
  fontFamily: 'Bricolage Grotesque',
  fontStyle: 'normal',
  lineHeight: 1.1,
  ...over,
});
const req = { canvasHeight: 1350 };
const sizeOf = (over: Record<string, unknown> = {}, r: { maxLines?: number } = {}) =>
  fit(text(over), { ...req, ...r })!;

describe('the adapter fits a text to its brand font', () => {
  it('scales maxFontSize with the page like fontSize', () => {
    expect(TEMPLATE_GEOMETRY['additionalTexts']!['maxFontSize']).toBe('s');
  });

  it('stays at maxFontSize when the box takes it, and fits the widest word otherwise', () => {
    expect(sizeOf({ maxFontSize: 80 })).toEqual({ fontSize: 80, fits: true });
    const narrow = sizeOf({ width: 400 });
    expect(narrow.fontSize).toBeLessThan(400);
    expect(narrow.fits).toBe(true);
    // One more px and the word "Nachrichten" alone would no longer fit one line.
    const word = (size: number) =>
      TEMPLATE_GATE_ADAPTER.lineCount(
        'additionalTexts',
        text({ text: 'Nachrichten', width: 400, fontSize: size })
      );
    expect(word(narrow.fontSize)).toBe(1);
    expect(word(narrow.fontSize + 1)).toBeGreaterThan(1);
  });

  it('fits different sizes in brand fonts of different widths, deterministically', () => {
    const anton = sizeOf({ fontFamily: 'Anton', width: 400 });
    const fraunces = sizeOf({ fontFamily: 'Fraunces', width: 400 });
    expect(anton.fontSize).toBeGreaterThan(fraunces.fontSize);
    expect(sizeOf({ fontFamily: 'Anton', width: 400 })).toEqual(anton);
  });

  it('shrinks for a heavier weight and grows (or stays) for tighter tracking', () => {
    const regular = sizeOf({ width: 400 }).fontSize;
    expect(sizeOf({ width: 400, fontWeight: 800 }).fontSize).toBeLessThan(regular);
    expect(sizeOf({ width: 400, letterSpacing: -0.03 }).fontSize).toBeGreaterThanOrEqual(regular);
    expect(sizeOf({ width: 400, letterSpacing: 0.1 }).fontSize).toBeLessThan(regular);
  });

  it('keeps the text within the slot budget lines, as the gate counts them', () => {
    const longer = 'Gute Nachrichten heute für alle Menschen im ganzen Land';
    const one = sizeOf({ text: longer }, {});
    const two = sizeOf({ text: longer }, { maxLines: 2 });
    expect(two.fontSize).toBeLessThan(one.fontSize);
    expect(
      TEMPLATE_GATE_ADAPTER.lineCount(
        'additionalTexts',
        text({ text: longer, fontSize: two.fontSize })
      )
    ).toBeLessThanOrEqual(2);
    // A shorter text grows back.
    expect(sizeOf({ text: 'Gute Nachrichten' }, { maxLines: 2 }).fontSize).toBeGreaterThan(
      two.fontSize
    );
  });

  it('holds the floor and says it does not fit', () => {
    const r = sizeOf({ width: 30 });
    expect(r).toEqual({ fontSize: minTextSizePx(1350), fits: false });
    expect(sizeOf({ width: 30, maxFontSize: 20 })).toEqual({ fontSize: 20, fits: false });
  });

  it('declines an element it has nothing to fit with', () => {
    expect(fit(text({ width: 0 }), req)).toBeNull();
    expect(fit(text({ maxFontSize: undefined }), req)).toBeNull();
  });
});
