// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { konvaFontStyle } from '../textUtils.js';

describe('konvaFontStyle', () => {
  it('keeps italic from fontStyle and takes the weight from fontWeight', () => {
    expect(konvaFontStyle('italic', 800)).toBe('italic 800');
  });

  it('fontWeight wins over the bold part of fontStyle', () => {
    expect(konvaFontStyle('bold', 500)).toBe('500');
    expect(konvaFontStyle('bold italic', 300)).toBe('italic 300');
  });

  it('without fontWeight it is today’s style', () => {
    expect(konvaFontStyle('bold', undefined)).toBe('bold');
    expect(konvaFontStyle('bold italic', undefined)).toBe('bold italic');
    expect(konvaFontStyle(undefined, undefined)).toBe('normal');
  });

  it('a plain weight on a normal style is just the weight', () => {
    expect(konvaFontStyle('normal', 800)).toBe('800');
  });
});
