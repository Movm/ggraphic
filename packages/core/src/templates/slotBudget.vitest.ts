// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { checkSlotBudget, countChars, countWords, minTextSizePx } from './slotBudget.js';

describe('slot budget', () => {
  it('counts 4 words in "Mehr Bus, weniger Stau"', () => {
    expect(countWords('Mehr Bus, weniger Stau')).toBe(4);
  });

  it('does not count **, ==, ++ markers as words or characters', () => {
    expect(countWords('Das ==Ziel== ist klar')).toBe(4);
    expect(countChars('Das ==Ziel== ist klar')).toBe(17);
    expect(countWords('**fett** ++plus++ ==hell==')).toBe(3);
    expect(countWords('** == ++')).toBe(0);
  });

  it('returns 0 words and 0 chars for "", "   " and "\\n\\n"', () => {
    for (const t of ['', '   ', '\n\n']) {
      expect(countWords(t)).toBe(0);
      expect(countChars(t)).toBe(0);
    }
  });

  it('flags 9 words against maxWords 8', () => {
    const text = 'eins zwei drei vier fünf sechs sieben acht neun';
    expect(checkSlotBudget({ text, fontSize: 60, canvasHeight: 1350 }, { maxWords: 8 })).toEqual([
      { kind: 'words', limit: 8, actual: 9 },
    ]);
  });

  it('flags characters over maxChars', () => {
    expect(
      checkSlotBudget({ text: 'abcdef\nghi', fontSize: 60, canvasHeight: 1350 }, { maxChars: 5 })
    ).toEqual([{ kind: 'chars', limit: 5, actual: 9 }]);
  });

  it('flags a 40 px text on a 1350 px canvas: limit 47.25', () => {
    expect(minTextSizePx(1350)).toBe(47.25);
    expect(checkSlotBudget({ text: 'Hi', fontSize: 40, canvasHeight: 1350 }, {})).toEqual([
      { kind: 'fontSize', limit: 47.25, actual: 40 },
    ]);
  });

  it('re-evaluates on a 1080 px canvas: limit 37.8', () => {
    expect(minTextSizePx(1080)).toBe(37.8);
    expect(checkSlotBudget({ text: 'Hi', fontSize: 40, canvasHeight: 1080 }, {})).toEqual([]);
  });

  it('counts an unbalanced marker as a single word', () => {
    expect(countWords('==a')).toBe(1);
    expect(countChars('==a')).toBe(1);
  });

  it('counts an astral character as one code point', () => {
    expect(countWords('🌍 Klima')).toBe(2);
    expect(countChars('🌍 Klima')).toBe(7);
  });

  it('checks lines only when lineCount is given', () => {
    const input = { text: 'a', fontSize: 60, canvasHeight: 1350 };
    expect(checkSlotBudget(input, { maxLines: 2 })).toEqual([]);
    expect(checkSlotBudget({ ...input, lineCount: 3 }, { maxLines: 2 })).toEqual([
      { kind: 'lines', limit: 2, actual: 3 },
    ]);
  });

  it('an empty budget yields no violations for a large text', () => {
    expect(
      checkSlotBudget({ text: 'wort '.repeat(500), fontSize: 60, canvasHeight: 1350 }, {})
    ).toEqual([]);
  });
});
