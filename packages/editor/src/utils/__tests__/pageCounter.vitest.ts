// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { PAGE_COUNTER_PROBE, shownText } from '../pageCounter.js';

describe('shownText', () => {
  it('is the stored text for a text without a counter', () => {
    expect(shownText({ text: '5 Fakten' }, 3)).toBe('5 Fakten');
    expect(shownText({ text: '5 Fakten' }, null)).toBe('5 Fakten');
  });

  it('is the page number (from 1) for a page counter', () => {
    expect(shownText({ text: '5', counter: 'page' }, 1)).toBe('1');
    expect(shownText({ text: '5', counter: 'page' }, 10)).toBe('10');
  });

  it('keeps the stored text when the page is not known (a single canvas, a preview)', () => {
    expect(shownText({ text: '5', counter: 'page' }, null)).toBe('5');
  });

  it('probes with the widest numeral a deck of up to 99 pages can show', () => {
    expect(PAGE_COUNTER_PROBE).toBe('00');
  });
});
