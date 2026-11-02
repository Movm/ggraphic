// SPDX-License-Identifier: AGPL-3.0-only
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

  it('takes the widest word from the caller when given one (a bold word is wider)', () => {
    // "Nachrichten" in bold, 1.2 times as wide: 300 / (5.5 * 1.2) = 45.4
    const slot = {
      ...base,
      width: 300,
      maxHeight: Infinity,
      widestWord: (size: number) => 11 * size * 0.5 * 1.2,
    };
    expect(fitFontSizeToSlot('Gute **Nachrichten** heute', slot, measureAt())).toBe(45);
  });
});

describe('binary search equals the linear scan', () => {
  const linear = (
    text: string,
    slot: Parameters<typeof fitFontSizeToSlot>[1],
    m: typeof measureAt extends (...a: infer _) => infer R ? R : never
  ) => {
    const min = slot.minSize ?? 12;
    let size = Math.max(slot.fontSize, slot.maxSize ?? slot.fontSize);
    while (size > min) {
      if (slotFits(text, slot, m, size)) return size;
      size -= 1;
    }
    return min;
  };
  const words = [
    'Gute',
    'Nachrichten',
    'für',
    'alle',
    'Gemeinschaftsgarten',
    'Land',
    'im',
    'Klimaschutz',
  ];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  it('fits(s) is monotone: a fitting size means every smaller size fits', () => {
    for (let i = 0; i < 20; i++) {
      const text = Array.from(
        { length: 2 + Math.floor(rnd() * 7) },
        () => words[Math.floor(rnd() * words.length)]
      ).join(' ');
      const slot = {
        ...base,
        width: 200 + rnd() * 600,
        maxHeight: Infinity,
        maxLines: 1 + Math.floor(rnd() * 3),
      };
      let fitted = false;
      for (let s = 84; s >= 20; s--) {
        const f = slotFits(text, slot, measureAt(), s);
        if (fitted) expect(f).toBe(true);
        fitted ||= f;
      }
    }
  });

  it('gives the same size as the linear scan on 50 random texts and boxes', () => {
    for (let i = 0; i < 50; i++) {
      const text = Array.from(
        { length: 1 + Math.floor(rnd() * 9) },
        () => words[Math.floor(rnd() * words.length)]
      ).join(' ');
      const slot = {
        ...base,
        width: 60 + rnd() * 900,
        maxHeight: rnd() < 0.5 ? Infinity : 100 + rnd() * 500,
        maxSize: 40 + Math.floor(rnd() * 300),
        minSize: 12 + Math.floor(rnd() * 20),
        wholeWords: rnd() < 0.7,
        ...(rnd() < 0.5 ? { maxLines: 1 + Math.floor(rnd() * 4) } : {}),
      };
      const m = measureAt(rnd() * 0.05 - 0.02);
      expect(fitFontSizeToSlot(text, slot, m)).toBe(linear(text, slot, m));
    }
  });
});

describe('room below', () => {
  const slot = { ...base, width: 700, maxHeight: Infinity, gap: 0.25, room: 200 };
  it('limits a multi-line text with a quarter line of air', () => {
    const size = fitFontSizeToSlot(LONGER, slot, measureAt());
    const lines = wrapLines(LONGER, 700, measureAt()(size)).length;
    expect(lines).toBeGreaterThan(1);
    expect((lines + 0.25) * size * 1.1).toBeLessThanOrEqual(200);
  });
  it('never shrinks a single line for it', () => {
    expect(fitFontSizeToSlot('Gute', { ...slot, room: 10 }, measureAt())).toBe(84);
  });
});
