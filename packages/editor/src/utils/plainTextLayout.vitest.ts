// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { plainTextLines } from './plainTextLayout.js';

describe('plainTextLines', () => {
  it('breaks inside a word per grapheme, so a decomposed accent stays whole', () => {
    // "é" as e + U+0301: two code points, one grapheme. Ten px a grapheme.
    const e = 'é';
    const lines = plainTextLines(e.repeat(3), 20, (_text, graphemes) => graphemes * 10);
    expect(lines).toEqual([e.repeat(2), e]);
  });

  it('hands the measure the grapheme count of the line', () => {
    const counts: number[] = [];
    plainTextLines('éé', 1000, (_text, graphemes) => {
      counts.push(graphemes);
      return 0;
    });
    expect(counts).toEqual([2]);
  });
});
