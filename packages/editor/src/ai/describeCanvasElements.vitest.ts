// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { describeCanvasElements } from './describeCanvasElements.js';

const text = (id: string, over: object = {}) => ({
  id,
  text: id,
  type: 'header',
  x: 10,
  y: 10,
  width: 100,
  fontSize: 20,
  fontFamily: 'Arial',
  fill: '#ffffff',
  ...over,
});

describe('describeCanvasElements', () => {
  it('lists a text, and leaves a decorative one (a ghost numeral) out', () => {
    const state = {
      additionalTexts: [text('title'), text('ghost', { decorative: true })],
      layerOrder: ['ghost', 'title'],
    };
    const ids = describeCanvasElements(state as never).map((e) => e.id);
    expect(ids).toEqual(['title']);
  });
});
