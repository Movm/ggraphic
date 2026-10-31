// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { roomBelow } from './instantiate.js';

type Obj = Record<string, unknown>;
const n = (el: Obj, k: string) => (typeof el[k] === 'number' ? (el[k] as number) : 0);
const boxOf = (_key: string, el: Obj) => ({
  x: n(el, 'x'),
  y: n(el, 'y'),
  width: n(el, 'width'),
  height: n(el, 'height') || 10,
});
const text = (id: string, y: number, x = 0, width = 500): Obj => ({
  id,
  x,
  y,
  width,
  fontSize: 50,
});

describe('roomBelow', () => {
  it('is the distance to the nearest element below that overlaps horizontally, of any kind', () => {
    const state = {
      additionalTexts: [text('h', 100)],
      shapeInstances: [{ id: 'far', x: 0, y: 900, width: 500, height: 50 }],
      chartInstances: [{ id: 'chart', x: 100, y: 600, width: 300, height: 300 }],
      userImageInstances: [{ id: 'aside', x: 600, y: 300, width: 100, height: 100 }],
    };
    expect(roomBelow(state, 'additionalTexts', state.additionalTexts[0]!, boxOf)).toBe(500);
  });

  it('is not limited by a plate or the page behind the text, nor by elements above', () => {
    const state = {
      shapeInstances: [{ id: 'plate', x: 0, y: 0, width: 1000, height: 1000 }],
      additionalTexts: [text('h', 100), text('above', 20)],
    };
    expect(roomBelow(state, 'additionalTexts', state.additionalTexts[0]!, boxOf)).toBeUndefined();
  });

  it('limits each text of a stack against the original top of the one below', () => {
    const state = {
      additionalTexts: [text('h', 100), text('sub', 300), text('foot', 700)],
    };
    const [h, sub, foot] = state.additionalTexts as [Obj, Obj, Obj];
    expect(roomBelow(state, 'additionalTexts', h, boxOf)).toBe(200);
    expect(roomBelow(state, 'additionalTexts', sub, boxOf)).toBe(400);
    expect(roomBelow(state, 'additionalTexts', foot, boxOf)).toBeUndefined();
  });
});
