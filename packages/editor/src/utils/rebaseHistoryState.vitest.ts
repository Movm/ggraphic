// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { rebaseHistoryState } from './rebaseHistoryState.js';

const el = (id: string, x: number) => ({ id, x });

describe('rebaseHistoryState', () => {
  it('patches only the element the remote edit changed', () => {
    const entry = { shapes: [el('a', 1), el('b', 1)] };
    const prev = { shapes: [el('a', 5), el('b', 1)] };
    const next = { shapes: [el('a', 5), el('b', 9)] };
    // `a` keeps the entry's own value, so this client's step on it still undoes.
    expect(rebaseHistoryState(entry, prev, next)).toEqual({ shapes: [el('a', 1), el('b', 9)] });
  });

  it('patches only the properties the remote edit changed on an element', () => {
    const entry = { texts: [{ id: 't', fontSize: 60, fill: '#fff' }] };
    const prev = { texts: [{ id: 't', fontSize: 62, fill: '#fff' }] };
    const next = { texts: [{ id: 't', fontSize: 62, fill: '#f00' }] };
    expect(rebaseHistoryState(entry, prev, next).texts).toEqual([
      { id: 't', fontSize: 60, fill: '#f00' },
    ]);
  });

  it('inserts an element the remote edit added, at its position', () => {
    const entry = { shapes: [el('a', 1), el('c', 1)] };
    const prev = { shapes: [el('a', 1), el('c', 1)] };
    const next = { shapes: [el('a', 1), el('b', 2), el('c', 1)] };
    expect(rebaseHistoryState(entry, prev, next).shapes).toEqual([
      el('a', 1),
      el('b', 2),
      el('c', 1),
    ]);
  });

  it('drops an element the remote edit removed', () => {
    const entry = { shapes: [el('a', 1), el('b', 1)] };
    const prev = { shapes: [el('a', 1), el('b', 1)] };
    const next = { shapes: [el('a', 1)] };
    expect(rebaseHistoryState(entry, prev, next).shapes).toEqual([el('a', 1)]);
  });

  it('keeps an element only this entry has (added by an own later step)', () => {
    const entry = { shapes: [el('a', 1), el('own', 3)] };
    const prev = { shapes: [el('a', 1)] };
    const next = { shapes: [el('a', 7)] };
    expect(rebaseHistoryState(entry, prev, next).shapes).toEqual([el('a', 7), el('own', 3)]);
  });

  it('patches records per key', () => {
    const entry = { iconStates: { i1: { color: 'red' }, i2: { color: 'red' } } };
    const prev = { iconStates: { i1: { color: 'blue' }, i2: { color: 'red' } } };
    const next = { iconStates: { i1: { color: 'blue' }, i2: { color: 'green' } } };
    expect(rebaseHistoryState(entry, prev, next).iconStates).toEqual({
      i1: { color: 'red' },
      i2: { color: 'green' },
    });
  });

  it('replaces scalars and plain lists whole, and deletes removed keys', () => {
    const entry = { line1: 'own', line2: 'old', layerOrder: ['a', 'b'], gone: 1, kept: 2 };
    const prev = { line1: 'x', line2: 'old', layerOrder: ['a', 'b'], gone: 1, kept: 2 };
    const next = { line1: 'x', line2: 'remote', layerOrder: ['b', 'a'], kept: 2 };
    expect(rebaseHistoryState(entry, prev, next)).toEqual({
      line1: 'own',
      line2: 'remote',
      layerOrder: ['b', 'a'],
      kept: 2,
    });
  });

  it('sets a key the entry did not have yet', () => {
    expect(rebaseHistoryState({}, { shapes: [] }, { shapes: [el('a', 1)] })).toEqual({
      shapes: [el('a', 1)],
    });
  });

  it('leaves the entry it was given untouched', () => {
    const entry = { shapes: [el('a', 1)] };
    rebaseHistoryState(entry, { shapes: [el('a', 1)] }, { shapes: [el('a', 2)] });
    expect(entry).toEqual({ shapes: [el('a', 1)] });
  });
});
