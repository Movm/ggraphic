// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { createElementActions } from './actionFactories.js';

import type { BaseCanvasState } from './baseTypes.js';

/**
 * A text added from the sidebar started at 48/36/32 px on a 1080 px page —
 * a third of the headlines templates set, wrapping after every word at 400 px.
 * It now starts at 120/72/56 px across 80 % of a 1080 px page and grows with
 * the page's width on every format, not only on slides.
 */
function addedOn(width: number, height: number, insertScale = 1) {
  let state = { additionalTexts: [] } as unknown as BaseCanvasState;
  const actions = createElementActions(
    () => state,
    (change) => {
      state = typeof change === 'function' ? change(state) : { ...state, ...change };
    },
    () => {},
    () => {},
    width,
    height,
    '#000000',
    undefined,
    insertScale
  );
  actions.addHeader();
  actions.addSubheader();
  actions.addText();
  actions.addBodyTextWithContent('Hallo');
  return state.additionalTexts.map((t) => ({
    type: t.type,
    fontSize: t.fontSize,
    width: t.width,
    centre: t.x + t.width / 2,
  }));
}

describe('the start size of a newly added text', () => {
  it('is 120 / 72 / 56 px across 864 px on a 1080 px page', () => {
    expect(addedOn(1080, 1350)).toEqual([
      { type: 'header', fontSize: 120, width: 864, centre: 540 },
      { type: 'subheader', fontSize: 72, width: 864, centre: 540 },
      { type: 'body', fontSize: 56, width: 864, centre: 540 },
      { type: 'body', fontSize: 56, width: 864, centre: 540 },
    ]);
  });

  it('grows with the page width, once, on a slide that also passes its insert scale', () => {
    const k = 1920 / 1080;
    const [header, , body] = addedOn(1920, 1080, k);
    expect(header!.fontSize).toBeCloseTo(120 * k);
    expect(header!.width).toBeCloseTo(864 * k);
    expect(header!.centre).toBeCloseTo(960);
    expect(body!.fontSize).toBeCloseTo(56 * k);
  });

  it('grows with the page width on a non-slide format too', () => {
    const [header] = addedOn(2160, 2160);
    expect(header!.fontSize).toBeCloseTo(240);
    expect(header!.width).toBeCloseTo(1728);
  });
});
