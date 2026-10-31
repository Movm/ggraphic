// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { fitFontSizeToSlot, slotFits } from './fitText.js';
import { wrapLines } from './listLayout.js';

// Every character is half an em wide: width = chars * size * 0.5 (+ tracking per character).
const measureAt =
  (tracking = 0, weightFactor = 1) =>
  (size: number) =>
  (text: string) =>
    text.length * (size * 0.5 * weightFactor + tracking * size);

const HEADLINE = 'Gute Nachrichten heute';
const LONGER = 'Gute Nachrichten heute für alle Menschen im ganzen Land';
const base = { lineHeight: 1.1, wholeWords: true, maxSize: 84, fontSize: 84, minSize: 20 };

describe('fitFontSizeToSlot with a ceiling (maxSize)', () => {
  it('stays at the ceiling when the box fits it', () => {
    const size = fitFontSizeToSlot(
      HEADLINE,
      { ...base, width: 700, maxHeight: Infinity },
      measureAt()
    );
    expect(size).toBe(84);
  });

  it('shrinks to the largest size where the longest word fits, never breaking a word', () => {
    // "Nachrichten" has 11 characters: 5.5 em. 300 / 5.5 = 54.5
    const size = fitFontSizeToSlot(
      HEADLINE,
      { ...base, width: 300, maxHeight: Infinity },
      measureAt()
    );
    expect(size).toBe(54);
    expect(slotFits(HEADLINE, { ...base, width: 300, maxHeight: Infinity }, measureAt(), 55)).toBe(
      false
    );
  });

  it('shrinks until the text takes at most maxLines lines, and grows back when shortened', () => {
    const slot = { ...base, width: 700, maxHeight: Infinity, maxLines: 2 };
    const size = fitFontSizeToSlot(LONGER, slot, measureAt());
    expect(size).toBeLessThan(84);
    expect(wrapLines(LONGER, 700, measureAt()(size)).length).toBeLessThanOrEqual(2);
    expect(wrapLines(LONGER, 700, measureAt()(size + 1)).length).toBeGreaterThan(2);
    expect(fitFontSizeToSlot(HEADLINE, slot, measureAt())).toBe(84);
  });

  it('holds the floor when even that does not fit, and says so', () => {
    const slot = { ...base, width: 40, maxHeight: Infinity };
    expect(fitFontSizeToSlot(HEADLINE, slot, measureAt())).toBe(20);
    expect(slotFits(HEADLINE, slot, measureAt(), 20)).toBe(false);
  });

  it('counts the height too when the box has one', () => {
    const slot = { ...base, width: 600, maxHeight: 200 };
    const size = fitFontSizeToSlot(LONGER, slot, measureAt());
    const lines = wrapLines(LONGER, 700, measureAt()(size)).length;
    expect(lines * size * 1.1).toBeLessThanOrEqual(200);
  });

  it('fits a heavier face smaller and a tighter tracking larger or equal', () => {
    const slot = { ...base, width: 300, maxHeight: Infinity };
    const regular = fitFontSizeToSlot(HEADLINE, slot, measureAt(0, 1));
    expect(fitFontSizeToSlot(HEADLINE, slot, measureAt(0, 1.2))).toBeLessThan(regular);
    expect(fitFontSizeToSlot(HEADLINE, slot, measureAt(-0.03, 1))).toBeGreaterThanOrEqual(regular);
  });

  it('takes the line count from the caller when given one', () => {
    const slot = { ...base, width: 700, maxHeight: Infinity, maxLines: 1, countLines: () => 2 };
    expect(fitFontSizeToSlot(HEADLINE, slot, measureAt())).toBe(20);
  });
});
