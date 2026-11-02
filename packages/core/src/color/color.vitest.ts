// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  mixColors,
  normalizeColor,
  parseColor,
  relativeLuminance,
  toHex,
} from './color';

describe('colour math', () => {
  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#457B9D', '#FFFFFF')).toBeCloseTo(4.59, 2);
    // The brief's 3.04 does not follow from its own WCAG formula; the formula gives 2.82.
    expect(contrastRatio('#F4C542', '#457B9D')).toBeCloseTo(2.82, 2);
    expect(contrastRatio('#000', '#000')).toBe(1);
  });

  it('returns null for contrast when either colour is unparseable', () => {
    expect(contrastRatio('red', '#fff')).toBeNull();
  });

  it('normalizes colours to lower-case hex', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor('rgb(0 0 0)')).toBe('#000000');
    expect(normalizeColor('rgba(255, 0, 0, 0.5)')).toBe('#ff000080');
    expect(normalizeColor('red')).toBe('red');
    expect(normalizeColor('  red  ')).toBe('red');
  });

  it('parses hex and rgb notations, rejecting the rest', () => {
    expect(parseColor('#12')).toBeNull();
    expect(parseColor('#112233aa')).toEqual({ r: 17, g: 34, b: 51, a: 170 / 255 });
    expect(parseColor('rgb(1,2,3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
  });

  it('keeps alpha out of the hex form only when it is opaque', () => {
    expect(toHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000');
    expect(toHex({ r: 255, g: 255, b: 255, a: 0.5 })).toBe('#ffffff80');
  });

  it('computes relative luminance without alpha', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 0 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBe(0);
  });

  it('mixes colours per channel in sRGB', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#1d3557', '#000000', 0)).toBe('#1d3557');
    expect(mixColors('#1d3557', '#000000', 1)).toBe('#000000');
    expect(mixColors('red', '#fff', 0.5)).toBeNull();
  });

  it('rejects a non-finite mix ratio', () => {
    expect(mixColors('#000000', '#ffffff', NaN)).toBeNull();
    expect(mixColors('#000000', '#ffffff', Infinity)).toBeNull();
  });

  it('clamps the mix ratio to 0–1', () => {
    expect(mixColors('#000000', '#ffffff', -1)).toBe('#000000');
    expect(mixColors('#000000', '#ffffff', 2)).toBe('#ffffff');
  });

  it('emits the canonical form that normalizeColor produces', () => {
    expect(toHex({ r: 300, g: -5, b: 12.4, a: 1 })).toBe('#ff000c');
    expect(toHex({ r: 0, g: 0, b: 0, a: 0.999 })).toBe('#000000');
    expect(normalizeColor('#AABBCCFF')).toBe('#aabbcc');
    for (const value of [
      { r: 17, g: 34, b: 51, a: 0.5 },
      { r: 1, g: 2, b: 3, a: 1 },
    ]) {
      expect(normalizeColor(toHex(value))).toBe(toHex(value));
    }
  });

  it('accepts uppercase functional notation and a slash-separated alpha', () => {
    expect(normalizeColor('RGB(0 0 0)')).toBe('#000000');
    expect(normalizeColor('rgb(0 0 0 / 0.5)')).toBe('#00000080');
  });

  it('round-trips an 8-digit hex colour', () => {
    expect(normalizeColor('#11223380')).toBe('#11223380');
  });
});
