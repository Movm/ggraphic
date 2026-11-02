// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { applyHistoryRebase, planHistoryRebase } from './rebaseHistoryState.js';

const rebaseHistoryState = (
  entry: Record<string, unknown>,
  prev: Record<string, unknown>,
  next: Record<string, unknown>
) => applyHistoryRebase(entry, planHistoryRebase(prev, next));

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

  it('merges a remote insert into a layer order an own step reordered', () => {
    // The entry is from before this client's reorder; undoing it must keep `d`.
    const entry = { layerOrder: ['a', 'b', 'c'] };
    const prev = { layerOrder: ['c', 'a', 'b'] };
    const next = { layerOrder: ['c', 'a', 'd', 'b'] };
    expect(rebaseHistoryState(entry, prev, next).layerOrder).toEqual(['a', 'd', 'b', 'c']);
  });

  it('applies a remote move and removal to an id list', () => {
    const entry = { layerOrder: ['x', 'a', 'b', 'c'] };
    const prev = { layerOrder: ['a', 'b', 'c'] };
    const next = { layerOrder: ['b', 'a'] };
    expect(rebaseHistoryState(entry, prev, next).layerOrder).toEqual(['x', 'b', 'a']);
  });

  it('appends a remote insert at the top when nothing follows it', () => {
    const entry = { lockedLayerIds: ['b'] };
    const prev = { lockedLayerIds: [] };
    const next = { lockedLayerIds: ['a'] };
    expect(rebaseHistoryState(entry, prev, next).lockedLayerIds).toEqual(['b', 'a']);
  });

  it('does not bring back an element an own later step added (undo of an add removes it)', () => {
    const entry = { shapes: [el('a', 1)] };
    const prev = { shapes: [el('a', 1), el('own', 3)] };
    const next = { shapes: [el('a', 1), el('own', 9)] };
    expect(rebaseHistoryState(entry, prev, next).shapes).toEqual([el('a', 1)]);
  });

  it('does not create a collection an own later step created', () => {
    const entry = { line1: 'x' };
    const prev = { line1: 'x', shapes: [el('own', 3)] };
    const next = { line1: 'x', shapes: [el('own', 9)] };
    expect(rebaseHistoryState(entry, prev, next)).toBe(entry);
  });

  it('returns the entry itself when the change does not reach it', () => {
    const entry = { shapes: [el('a', 1)], line1: 'x' };
    const prev = { shapes: [el('a', 1), el('own', 3)], line1: 'x' };
    const next = { shapes: [el('a', 1), el('own', 4)], line1: 'x' };
    expect(rebaseHistoryState(entry, prev, next)).toBe(entry);
  });

  it('keeps the references of the elements it does not change', () => {
    const a = el('a', 1);
    const entry = { shapes: [a, el('b', 1)] };
    const result = rebaseHistoryState(entry, { shapes: [el('b', 1)] }, { shapes: [el('b', 2)] });
    expect((result.shapes as unknown[])[0]).toBe(a);
  });

  it('plans nothing when only references changed', () => {
    expect(planHistoryRebase({ shapes: [el('a', 1)] }, { shapes: [el('a', 1)] })).toEqual([]);
  });
});
