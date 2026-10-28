// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { fitFontSizeToSlot } from './fitText.js';
import { hyphenationPoints } from './hyphenation.js';
import { wrapLines } from './listLayout.js';

const split = (word: string) => {
  const parts: string[] = [];
  let from = 0;
  for (const p of hyphenationPoints(word)) {
    parts.push(word.slice(from, p));
    from = p;
  }
  parts.push(word.slice(from));
  return parts;
};

describe('hyphenationPoints', () => {
  it('splits German words at syllable boundaries, compounds at the join', () => {
    expect(split('Gemeinschaftsgarten')).toEqual(['Ge', 'mein', 'schafts', 'gar', 'ten']);
    expect(split('Straßenbahn')).toEqual(['Stra', 'ßen', 'bahn']);
    expect(split('Zucker')).toEqual(['Zu', 'cker']);
  });

  it('leaves short words and words with digits whole, and breaks after hyphens', () => {
    expect(split('Haus')).toEqual(['Haus']);
    expect(split('A4')).toEqual(['A4']);
    expect(split('Bürger-Initiative')).toContain('ger-');
  });
});

// Monospace: every character is 10 px wide.
const mono = (text: string) => text.length * 10;

describe('wrapLines with a word wider than the box', () => {
  it('hyphenates "Gemeinschaftsgarten" instead of breaking inside a syllable', () => {
    const lines = wrapLines('Gemeinschaftsgarten', 130, mono);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => mono(l) <= 130)).toBe(true);
    // Every break but the last carries a hyphen, and the word is whole again without them.
    expect(lines.slice(0, -1).every((l) => l.endsWith('-'))).toBe(true);
    expect(lines.map((l) => l.replace(/-$/, '')).join('')).toBe('Gemeinschaftsgarten');
    expect(lines[0]).toBe('Gemein-');
  });

  it('keeps a word that fits whole and wraps normal text as before', () => {
    expect(wrapLines('Ein Garten für alle', 100, mono)).toEqual(['Ein Garten', 'für alle']);
  });

  it('falls back to a hard break when no syllable fits', () => {
    const lines = wrapLines('Gemeinschaftsgarten', 20, mono);
    expect(lines.every((l) => mono(l) <= 20)).toBe(true);
  });
});

describe('fitFontSizeToSlot', () => {
  const measureAt = (size: number) => (text: string) => text.length * size * 0.5;

  it('keeps the size when the text fits the slot', () => {
    expect(
      fitFontSizeToSlot(
        'Garten',
        { width: 400, maxHeight: 200, fontSize: 100, lineHeight: 1.1 },
        measureAt
      )
    ).toBe(100);
  });

  it('shrinks until the lines fit the slot', () => {
    const size = fitFontSizeToSlot(
      'Gemeinschaftsgarten am Stadtrand',
      { width: 300, maxHeight: 200, fontSize: 100, lineHeight: 1.1 },
      measureAt
    );
    expect(size).toBeLessThan(100);
    const lines = wrapLines('Gemeinschaftsgarten am Stadtrand', 300, measureAt(size));
    expect(lines.length * size * 1.1).toBeLessThanOrEqual(200);
  });

  it('shrinks a word that cannot be hyphenated to fit, never below the minimum', () => {
    const size = fitFontSizeToSlot(
      'Gemeinschaftsgarten',
      { width: 60, maxHeight: 10000, fontSize: 100, lineHeight: 1.1, minSize: 12 },
      measureAt
    );
    expect(size).toBeLessThan(100);
    expect(size).toBeGreaterThanOrEqual(12);
  });
});
