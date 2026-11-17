// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Two clients editing one page offline, then syncing: the results the concurrency table of
 * "Version 4" (`packages/schema/DOCUMENT_VERSIONING.md`) promises.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { buildStateMap, readStateKey, stateKeyClasses, writeStateKeys } from './index.js';

const classes = stateKeyClasses();
const LIFT = { classes, lift: true };

type Shape = { id: string } & Record<string, unknown>;

const SHAPES: Shape[] = [
  { id: 'a', x: 0, fill: '#000' },
  { id: 'b', x: 10, fill: '#000' },
  { id: 'c', x: 20, fill: '#000' },
  { id: 'd', x: 30, fill: '#000' },
];

/** Two docs holding the same lifted page, then disconnected. */
function pair(state: Record<string, unknown>, lift = true) {
  const a = new Y.Doc();
  const page = new Y.Map<unknown>();
  page.set('state', buildStateMap(state, { classes, lift }));
  a.getMap<Y.Map<unknown>>('pagesById').set('p', page);
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const stateOf = (doc: Y.Doc) =>
    doc.getMap<Y.Map<unknown>>('pagesById').get('p')!.get('state') as Y.Map<unknown>;
  const sync = () => {
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  };
  const read = (doc: Y.Doc, key: string) => readStateKey(stateOf(doc), key);
  /** The value under `key` after sync, asserted equal on both sides. */
  const settled = (key: string) => {
    sync();
    const value = read(a, key);
    expect(read(b, key)).toStrictEqual(value);
    return value;
  };
  const edit = (doc: Y.Doc, key: string, change: (value: never) => unknown) =>
    writeStateKeys(stateOf(doc), { [key]: change(structuredClone(read(doc, key)) as never) }, LIFT);
  return { a, b, stateOf, sync, read, settled, edit };
}

const set = (id: string, patch: Record<string, unknown>) => (list: Shape[]) =>
  list.map((s) => (s.id === id ? { ...s, ...patch } : s));
const move = (id: string, to: number) => (list: Shape[]) => {
  const rest = list.filter((s) => s.id !== id);
  rest.splice(
    to,
    0,
    list.find((s) => s.id === id)!
  );
  return rest;
};
const ids = (value: unknown) => (value as Shape[]).map((s) => s.id);

describe('concurrent edits of one collection', () => {
  it('different elements: both edits survive', () => {
    const p = pair({ shapeInstances: SHAPES });
    p.edit(p.a, 'shapeInstances', set('a', { x: 100 }));
    p.edit(p.b, 'shapeInstances', set('c', { x: 300 }));
    const shapes = p.settled('shapeInstances') as Shape[];
    expect(shapes.find((s) => s.id === 'a')!['x']).toBe(100);
    expect(shapes.find((s) => s.id === 'c')!['x']).toBe(300);
  });

  it('different elements added: both survive, in the same order everywhere', () => {
    const p = pair({ shapeInstances: SHAPES });
    p.edit(p.a, 'shapeInstances', (list: Shape[]) => [...list, { id: 'x' }]);
    p.edit(p.b, 'shapeInstances', (list: Shape[]) => [...list, { id: 'y' }]);
    const order = ids(p.settled('shapeInstances'));
    expect(order.slice(0, 4)).toEqual(['a', 'b', 'c', 'd']);
    expect(order.slice(4).sort()).toEqual(['x', 'y']);
  });

  it('different properties of one element: both survive', () => {
    const p = pair({ shapeInstances: SHAPES });
    p.edit(p.a, 'shapeInstances', set('b', { x: 111, y: 222 }));
    p.edit(p.b, 'shapeInstances', set('b', { fill: '#f00' }));
    const b = (p.settled('shapeInstances') as Shape[]).find((s) => s.id === 'b');
    expect(b).toStrictEqual({ id: 'b', x: 111, fill: '#f00', y: 222 });
  });

  it('the same property: last writer wins, the same on both sides', () => {
    const p = pair({ shapeInstances: SHAPES });
    p.edit(p.a, 'shapeInstances', set('b', { x: 1 }));
    p.edit(p.b, 'shapeInstances', set('b', { x: 2 }));
    const x = (p.settled('shapeInstances') as Shape[]).find((s) => s.id === 'b')!['x'];
    expect([1, 2]).toContain(x);
  });

  it('delete versus edit: the delete wins', () => {
    const p = pair({ shapeInstances: SHAPES });
    p.edit(p.a, 'shapeInstances', (list: Shape[]) => list.filter((s) => s.id !== 'b'));
    p.edit(p.b, 'shapeInstances', set('b', { x: 999 }));
    expect(ids(p.settled('shapeInstances'))).toEqual(['a', 'c', 'd']);
  });

  it('the same element moved by both: one position, never duplicated', () => {
    const p = pair({ shapeInstances: SHAPES });
    p.edit(p.a, 'shapeInstances', move('b', 3));
    p.edit(p.b, 'shapeInstances', move('b', 0));
    const order = ids(p.settled('shapeInstances'));
    expect(order.filter((id) => id === 'b')).toHaveLength(1);
    expect([
      ['a', 'c', 'd', 'b'],
      ['b', 'a', 'c', 'd'],
    ]).toContainEqual(order);
  });

  it('different elements moved: both moves apply', () => {
    const p = pair({ shapeInstances: SHAPES });
    p.edit(p.a, 'shapeInstances', move('a', 3)); // b c d a
    p.edit(p.b, 'shapeInstances', move('c', 0)); // c a b d
    expect(ids(p.settled('shapeInstances'))).toEqual(['c', 'b', 'd', 'a']);
  });

  it('a move and an edit of the same element: both survive', () => {
    const p = pair({ shapeInstances: SHAPES });
    p.edit(p.a, 'shapeInstances', move('a', 3));
    p.edit(p.b, 'shapeInstances', set('a', { fill: '#fff' }));
    const shapes = p.settled('shapeInstances') as Shape[];
    expect(ids(shapes)).toEqual(['b', 'c', 'd', 'a']);
    expect(shapes[3]!['fill']).toBe('#fff');
  });

  it('offline: three edits on one side, one on the other, all survive', () => {
    const p = pair({ shapeInstances: SHAPES });
    p.edit(p.a, 'shapeInstances', set('a', { x: 1 }));
    p.edit(p.a, 'shapeInstances', set('b', { x: 2 }));
    p.edit(p.a, 'shapeInstances', set('c', { x: 3 }));
    p.edit(p.b, 'shapeInstances', set('d', { x: 4 }));
    const xs = (p.settled('shapeInstances') as Shape[]).map((s) => s['x']);
    expect(xs).toEqual([1, 2, 3, 4]);
  });
});

describe('concurrent edits of id lists and records', () => {
  it('concurrent reorder of one id: one position, no duplicate', () => {
    const p = pair({ layerOrder: ['a', 'b', 'c', 'd'] });
    p.edit(p.a, 'layerOrder', () => ['a', 'c', 'd', 'b']);
    p.edit(p.b, 'layerOrder', () => ['b', 'a', 'c', 'd']);
    const order = p.settled('layerOrder') as string[];
    expect(order.filter((id) => id === 'b')).toHaveLength(1);
    expect(order).toHaveLength(4);
  });

  it('add and remove in an order key at once: both apply', () => {
    const p = pair({ layerOrder: ['a', 'b', 'c'] });
    p.edit(p.a, 'layerOrder', (order: string[]) => [...order, 'x']);
    p.edit(p.b, 'layerOrder', (order: string[]) => order.filter((id) => id !== 'b'));
    expect(p.settled('layerOrder')).toEqual(['a', 'c', 'x']);
  });

  it('lock different layers: both apply; lock the same layer: one entry', () => {
    const p = pair({ lockedLayerIds: [] });
    p.edit(p.a, 'lockedLayerIds', (locked: string[]) => [...locked, 'a', 'same']);
    p.edit(p.b, 'lockedLayerIds', (locked: string[]) => [...locked, 'b', 'same']);
    const locked = p.settled('lockedLayerIds') as string[];
    expect([...locked].sort()).toEqual(['a', 'b', 'same']);
  });

  it('delete an element while the other moves it in layerOrder: the move survives', () => {
    const p = pair({ shapeInstances: SHAPES, layerOrder: ['a', 'b', 'c', 'd'] });
    writeStateKeys(
      p.stateOf(p.a),
      {
        shapeInstances: SHAPES.filter((s) => s.id !== 'b'),
        layerOrder: ['a', 'c', 'd'],
      },
      LIFT
    );
    p.edit(p.b, 'layerOrder', () => ['a', 'c', 'd', 'b']);
    expect(ids(p.settled('shapeInstances'))).toEqual(['a', 'c', 'd']);
    expect(p.settled('layerOrder')).toEqual(['a', 'c', 'd', 'b']);
  });

  it('different properties of one icon: last writer wins on the whole entry', () => {
    const p = pair({ iconStates: { i: { x: 0, color: '#000' }, j: { x: 0 } } });
    p.edit(p.a, 'iconStates', (r: Record<string, object>) => ({ ...r, i: { ...r['i'], x: 5 } }));
    p.edit(p.b, 'iconStates', (r: Record<string, object>) => ({
      ...r,
      i: { ...r['i'], color: '#f00' },
      j: { x: 7 },
    }));
    const icons = p.settled('iconStates') as Record<string, unknown>;
    expect([
      { x: 5, color: '#000' },
      { x: 0, color: '#f00' },
    ]).toContainEqual(icons['i']);
    expect(icons['j']).toEqual({ x: 7 });
  });
});

describe('the accepted key-level races', () => {
  it('both add the first element of a kind where the key is absent: one side wins', () => {
    const p = pair({ headline: 'x' });
    p.edit(p.a, 'shapeInstances', () => [{ id: 'from-a' }]);
    p.edit(p.b, 'shapeInstances', () => [{ id: 'from-b' }]);
    const order = ids(p.settled('shapeInstances'));
    expect(order).toHaveLength(1);
    expect(['from-a', 'from-b']).toContain(order[0]);
  });

  it('an old writer storing plain JSON over a structured key wins at key level', () => {
    const p = pair({ shapeInstances: SHAPES });
    p.stateOf(p.a).set('shapeInstances', [{ id: 'old' }]);
    p.edit(p.b, 'shapeInstances', set('a', { x: 5 }));
    // B's edit went into the structure, which A's whole-value write replaced: version 3's
    // behaviour, not a new loss. The next lift turns the plain value into a structure again.
    expect(p.settled('shapeInstances')).toStrictEqual([{ id: 'old' }]);
    expect(p.stateOf(p.b).get('shapeInstances')).not.toBeInstanceOf(Y.Map);
  });
});
