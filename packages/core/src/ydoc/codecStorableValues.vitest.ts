// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The codec writes only values Yjs stores and decodes unchanged as JSON (review of #211,
 * finding 3). A value it rejects is rejected before anything is written, at every depth the codec
 * hands to Yjs: an element property, a record entry, a whole plain key. Before the check, a
 * function inside an element made `Y.Map.set` throw `Unexpected content type` after the
 * element's other properties had been written, and a `Date` was stored and decoded as `{}` on
 * every peer.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  assertWritableState,
  buildStateMap,
  readState,
  readStateKey,
  stateKeyClasses,
  writeStateKeys,
} from './index.js';

const LIFT = { classes: stateKeyClasses(), lift: true };

/** A version 4 document with one structured collection, one record and one plain key. */
function doc() {
  const d = new Y.Doc();
  d.getMap('meta').set('schemaVersion', 4);
  const stateY = new Y.Map<unknown>();
  d.getMap('pagesById').set('p', stateY);
  writeStateKeys(
    stateY,
    {
      shapeInstances: [
        { id: 'a', x: 1, fill: '#000' },
        { id: 'b', x: 2 },
      ],
      iconStates: { i1: { color: 'red' } },
      headline: 'Eins',
    },
    LIFT
  );
  return { d, stateY };
}

class Shape {
  id = 'a';
  x = 1;
}
const nullProto = Object.assign(Object.create(null) as object, { id: 'a' });
const hidden = Object.defineProperty({ id: 'a' }, 'secret', { value: 1, enumerable: false });
const cyclic: Record<string, unknown> = { id: 'a' };
cyclic['self'] = cyclic;

/** Values that must be rejected, each placed where the codec hands it to Yjs. */
const REJECTED: [string, unknown][] = [
  ['a function', () => 1],
  ['a symbol', Symbol('s')],
  ['a BigInt', 1n],
  ['a Date', new Date(0)],
  ['a Map', new Map([[1, 2]])],
  ['a Set', new Set([1])],
  ['a Uint8Array', new Uint8Array([1, 2])],
  ['a Float32Array', new Float32Array([1])],
  ['an ArrayBuffer', new ArrayBuffer(2)],
  ['a class instance', new Shape()],
  ['a boxed number', Object(1) as unknown],
  ['an object without prototype', nullProto],
  ['an object with a symbol key', { [Symbol('k')]: 1 }],
  ['an object with a non-enumerable key', hidden],
  ['a cycle', cyclic],
  ['a Yjs value', new Y.Map()],
];

const placements: [string, (v: unknown) => Record<string, unknown>][] = [
  [
    'an element property',
    (v) => ({
      shapeInstances: [
        { id: 'a', x: 9, fill: v },
        { id: 'b', x: 2 },
      ],
    }),
  ],
  [
    'deep inside an element property',
    (v) => ({
      shapeInstances: [
        { id: 'a', x: 9, crop: { inner: [1, { v }] } },
        { id: 'b', x: 2 },
      ],
    }),
  ],
  ['a record entry', (v) => ({ iconStates: { i1: { color: 'blue' }, i2: v } })],
  ['a plain key', (v) => ({ headline: 'Zwei', subtitle: v })],
];

describe('writeStateKeys rejects what Yjs cannot store unchanged, and writes nothing', () => {
  for (const [placement, place] of placements) {
    // Nested inside an encoded value, a null-prototype object decodes as an equal plain one.
    const cases = placement.startsWith('deep')
      ? REJECTED.filter(([name]) => name !== 'an object without prototype')
      : REJECTED;
    it.each(cases)(`%s as ${placement}`, (_name, value) => {
      const { d, stateY } = doc();
      const before = Y.encodeStateVector(d);
      const view = readState(stateY);
      expect(() => writeStateKeys(stateY, place(value), LIFT)).toThrow(/writeStateKeys: /);
      expect(Y.encodeStateVector(d)).toEqual(before);
      expect(readState(stateY)).toEqual(view);
      expect(() => assertWritableState(place(value), LIFT, stateY)).toThrow(/state write rejected/);
      expect(() => buildStateMap(place(value), LIFT)).toThrow(/buildStateMap: /);
    });
  }

  it('names where the problem is', () => {
    const { stateY } = doc();
    expect(() =>
      writeStateKeys(stateY, { shapeInstances: [{ id: 'a', crop: { at: new Date(0) } }] }, LIFT)
    ).toThrow("'shapeInstances'[0].crop.at is a Date");
  });
});

describe('a key named __proto__', () => {
  const proto = () => JSON.parse('{"__proto__": 1, "x": 2}') as Record<string, unknown>;
  it('is kept as an element property or a record key: they are map keys', () => {
    const { d, stateY } = doc();
    writeStateKeys(
      stateY,
      { shapeInstances: [{ id: 'a', ...proto() }, { id: 'b' }], iconStates: proto() },
      LIFT
    );
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(d));
    const peerState = peer.getMap('pagesById').get('p') as Y.Map<unknown>;
    const element = (readStateKey(peerState, 'shapeInstances') as Record<string, unknown>[])[0]!;
    expect(Object.hasOwn(element, '__proto__')).toBe(true);
    expect(Object.hasOwn(readStateKey(peerState, 'iconStates') as object, '__proto__')).toBe(true);
  });

  it('is rejected inside an encoded value, where the decoder would drop it', () => {
    const { stateY } = doc();
    expect(() => writeStateKeys(stateY, { headline: proto() }, LIFT)).toThrow(/__proto__/);
    expect(() =>
      writeStateKeys(stateY, { shapeInstances: [{ id: 'a', crop: proto() }] }, LIFT)
    ).toThrow(/__proto__/);
  });
});

describe('values Yjs stores unchanged are written, and read back the same on a peer', () => {
  const sparse: unknown[] = [];
  sparse[2] = 3;
  const ACCEPTED: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['NaN', NaN],
    ['Infinity', -Infinity],
    ['-0', -0],
    ['nested plain JSON', { a: [1, 'x', true, null, { b: {} }] }],
    ['undefined inside an array', [1, undefined, 3]],
    ['an array with a hole', sparse],
    ['an object without prototype, nested', [nullProto]],
    ['the same object twice (no cycle)', ((o) => ({ l: o, r: o }))({ k: 1 })],
  ];
  it.each(ACCEPTED)('%s', (_name, value) => {
    const { d, stateY } = doc();
    const partial = {
      shapeInstances: [
        { id: 'a', x: 1, v: value },
        { id: 'b', x: 2 },
      ],
      iconStates: { i1: { color: 'red' }, i2: value },
      subtitle: value,
    };
    writeStateKeys(stateY, partial, LIFT);
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(d));
    const peerState = peer.getMap('pagesById').get('p') as Y.Map<unknown>;
    for (const key of Object.keys(partial)) {
      // Decoded values: holes come back as `undefined`, which `toEqual` treats alike.
      expect(readStateKey(peerState, key), key).toEqual(readStateKey(stateY, key));
    }
  });
});
