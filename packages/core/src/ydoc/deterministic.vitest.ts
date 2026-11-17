// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The deterministic lift identity (`deterministic.ts`): two replicas that lift the same document
 * state under it write identical Yjs structs, which Yjs keeps once; replicas with different
 * states (also when only a deletion differs) get different ids; nothing outside the transaction
 * sees the derived id; and Yjs handles ids above 2^32.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  deterministicClientId,
  liftDocumentState,
  liftSalt,
  readState,
  stateKeyClasses,
  transactDeterministically,
} from './index.js';
import { cyrb53, isDerivedClientId } from './internal.js';

const classes = stateKeyClasses();
const SALT = liftSalt({ schemaVersion: 4, kindVersions: {} }, classes);
const GOLDEN_LENGTH = 469;
const GOLDEN_HASH = 7329282182823857;

/** A plain (version 3) document with one page; `clientID` is the creator's. */
function v3(state: Record<string, unknown>): Y.Doc {
  const doc = new Y.Doc();
  doc.clientID = 500;
  doc.transact(() => {
    const page = new Y.Map<unknown>();
    const stateY = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(state)) stateY.set(k, v);
    page.set('state', stateY);
    doc.getMap('pagesById').set('p1', page);
    doc.getMap('meta').set('schemaVersion', 3);
  });
  return doc;
}
const replica = (doc: Y.Doc, clientID: number) => {
  const copy = new Y.Doc();
  copy.clientID = clientID;
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
};
const stateOf = (doc: Y.Doc) =>
  (doc.getMap('pagesById').get('p1') as Y.Map<unknown>).get('state') as Y.Map<unknown>;
const lift = (doc: Y.Doc) =>
  transactDeterministically(doc, SALT, () => {
    doc.getMap('meta').set('schemaVersion', 4);
    liftDocumentState(doc, classes);
  });
/** What `doc` has beyond `base`: its own structs and deletions. */
const since = (doc: Y.Doc, base: Y.Doc) => Y.encodeStateAsUpdate(doc, Y.encodeStateVector(base));

const SHAPES = [
  { id: 'a', x: 1, fill: { r: 1, g: 2 } },
  { id: 'b', x: 2 },
];

describe('two replicas lifting one state', () => {
  it('derive one id, above every Yjs-generated id', () => {
    const doc = v3({ shapeInstances: SHAPES, layerOrder: ['a', 'b'] });
    const a = replica(doc, 1);
    const b = replica(doc, 2);
    const id = deterministicClientId(a, SALT);
    expect(deterministicClientId(b, SALT)).toBe(id);
    expect(isDerivedClientId(id)).toBe(true);
    expect(id).toBeGreaterThanOrEqual(2 ** 32);
    expect(id).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });

  it('write byte-identical structs, which Yjs keeps once', () => {
    const doc = v3({ shapeInstances: SHAPES, layerOrder: ['a', 'b'], iconStates: { i: 1 } });
    const a = replica(doc, 1);
    const b = replica(doc, 2);
    lift(a);
    lift(b);
    expect(since(a, doc)).toEqual(since(b, doc));
    const before = Y.encodeStateVector(a);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(Y.encodeStateVector(a)).toEqual(before);
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
  });

  it('also when the replicas integrated the same keys in different orders', () => {
    // Two writers set two keys concurrently; the replicas receive them in opposite orders, so
    // their maps iterate the keys differently. The lift writes in UTF-16 code-unit order anyway.
    const doc = v3({});
    const w1 = replica(doc, 11);
    const w2 = replica(doc, 12);
    stateOf(w1).set('shapeInstances', SHAPES);
    stateOf(w2).set('layerOrder', ['b', 'a']);
    const u1 = since(w1, doc);
    const u2 = since(w2, doc);
    const a = replica(doc, 1);
    const b = replica(doc, 2);
    Y.applyUpdate(a, u1);
    Y.applyUpdate(a, u2);
    Y.applyUpdate(b, u2);
    Y.applyUpdate(b, u1);
    expect(Array.from(stateOf(a).keys())).not.toEqual(Array.from(stateOf(b).keys()));
    const before = Y.encodeStateVector(a);
    expect(Y.encodeStateVector(b)).toEqual(before);
    lift(a);
    lift(b);
    // The structs the lifts wrote, relative to the common state before them: byte-identical.
    expect(Y.encodeStateAsUpdate(a, before)).toEqual(Y.encodeStateAsUpdate(b, before));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
    // An edit inside one replica's structure lands in the other's: the structs are the same.
    const element = (d: Y.Doc) =>
      (stateOf(d).get('shapeInstances') as Y.Map<unknown>).get('b') as Y.Map<unknown>;
    element(b).set('x', 42);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
    expect(readState(stateOf(a))).toEqual(readState(stateOf(b)));
    expect((readState(stateOf(a))['shapeInstances'] as { x: number }[])[1]!.x).toBe(42);
  });

  it('merge the edits each makes afterwards into one structure', () => {
    const doc = v3({ shapeInstances: SHAPES });
    const a = replica(doc, 1);
    const b = replica(doc, 2);
    lift(a);
    lift(b);
    const element = (d: Y.Doc, id: string) =>
      (stateOf(d).get('shapeInstances') as Y.Map<unknown>).get(id) as Y.Map<unknown>;
    element(a, 'a').set('x', 100);
    element(b, 'b').set('x', 200);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    for (const d of [a, b]) {
      expect(readState(stateOf(d))['shapeInstances']).toEqual([
        { id: 'a', x: 100, fill: { r: 1, g: 2 } },
        { id: 'b', x: 200 },
      ]);
    }
  });
});

describe('replicas with different states get different ids', () => {
  it('a different salt (another build) gives another id', () => {
    const doc = v3({ shapeInstances: SHAPES });
    const other = liftSalt({ schemaVersion: 4, kindVersions: {} }, stateKeyClasses(['stamps']));
    expect(deterministicClientId(doc, other)).not.toBe(deterministicClientId(doc, SALT));
  });

  it('an extra edit gives another id; their lifts then meet at key level, and converge', () => {
    const doc = v3({ shapeInstances: SHAPES, headline: 'h' });
    const a = replica(doc, 1);
    const b = replica(doc, 2);
    stateOf(a).set('headline', 'from a');
    Y.applyUpdate(b, since(a, doc));
    const c = replica(doc, 3); // never saw the edit
    expect(deterministicClientId(b, SALT)).not.toBe(deterministicClientId(c, SALT));
    lift(b);
    lift(c);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(c));
    Y.applyUpdate(c, Y.encodeStateAsUpdate(b));
    expect(readState(stateOf(b))).toEqual(readState(stateOf(c)));
  });

  it('a deletion alone (same state vector) gives another id', () => {
    // A map key's deletion adds no struct: the state vectors stay equal, the content does not.
    const doc = v3({ shapeInstances: SHAPES, iconStates: { i: 1 } });
    const a = replica(doc, 1);
    const b = replica(doc, 2);
    stateOf(a).delete('iconStates');
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
    expect(deterministicClientId(a, SALT)).not.toBe(deterministicClientId(b, SALT));
  });

  it('why the delete set must be in the id: under a state-vector-only id the replicas diverge', () => {
    const doc = v3({ shapeInstances: SHAPES, iconStates: { i: 1 } });
    const a = replica(doc, 1);
    const b = replica(doc, 2);
    stateOf(a).delete('iconStates');
    const svOnly = (d: Y.Doc) => 2 ** 32 + (cyrb53(Y.encodeStateVector(d)) % 2 ** 20);
    for (const d of [a, b]) {
      const own = d.clientID;
      d.transact(() => {
        d.clientID = svOnly(d);
        liftDocumentState(d, classes);
        d.clientID = own;
      });
    }
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    // Same struct ids, different content: Yjs kept each side's own, and they never converge.
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
    expect(readState(stateOf(a))).not.toEqual(readState(stateOf(b)));
    // With the real derivation, the same two states converge (key-level for iconStates).
    const a2 = replica(doc, 1);
    const b2 = replica(doc, 2);
    stateOf(a2).delete('iconStates');
    lift(a2);
    lift(b2);
    Y.applyUpdate(a2, Y.encodeStateAsUpdate(b2));
    Y.applyUpdate(b2, Y.encodeStateAsUpdate(a2));
    expect(readState(stateOf(a2))).toEqual(readState(stateOf(b2)));
  });

  it('a re-lift after an old writer wrote plain JSON uses a new id, and two re-lifts still merge', () => {
    const doc = v3({ shapeInstances: SHAPES });
    lift(doc);
    const first = Array.from(Y.decodeStateVector(Y.encodeStateVector(doc)).keys()).find(
      isDerivedClientId
    )!;
    stateOf(doc).set('shapeInstances', [{ id: 'a', x: 9 }]); // an old writer
    const a = replica(doc, 1);
    const b = replica(doc, 2);
    const second = deterministicClientId(a, SALT);
    expect(second).not.toBe(first);
    lift(a);
    lift(b);
    expect(since(a, doc)).toEqual(since(b, doc));
    // The first id's range is not continued: its clock is unchanged.
    expect(Y.decodeStateVector(Y.encodeStateVector(a)).get(first)).toBe(
      Y.decodeStateVector(Y.encodeStateVector(doc)).get(first)
    );
  });
});

describe('the derived id stays inside the transaction', () => {
  it('handlers, observers and later writes see the document’s own id', () => {
    const doc = v3({ shapeInstances: SHAPES });
    doc.clientID = 77;
    const seen: [string, number][] = [];
    doc.on('beforeTransaction', () => seen.push(['beforeTransaction', doc.clientID]));
    doc.on('afterTransaction', () => seen.push(['afterTransaction', doc.clientID]));
    doc.on('update', () => seen.push(['update', doc.clientID]));
    doc.getMap('pagesById').observeDeep(() => seen.push(['observeDeep', doc.clientID]));
    // An observer that writes in reaction: its write must carry the real id.
    doc.getMap('meta').observe(() => {
      if (!doc.getMap('meta').has('seen')) doc.getMap('meta').set('seen', true);
    });
    lift(doc);
    expect(seen.length).toBeGreaterThan(0);
    for (const [where, id] of seen) expect(id, where).toBe(77);
    expect(doc.clientID).toBe(77);
    const sv = Y.decodeStateVector(Y.encodeStateVector(doc));
    const derived = Array.from(sv.keys()).filter(isDerivedClientId);
    expect(derived).toHaveLength(1);
    // The reacting observer's write is the document's own.
    expect(sv.get(77)).toBe(1);
  });

  it('the id is set back when the function throws, and nothing runs inside another transaction', () => {
    const doc = v3({});
    doc.clientID = 77;
    expect(() =>
      transactDeterministically(doc, SALT, () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(doc.clientID).toBe(77);
    doc.transact(() => {
      expect(() => transactDeterministically(doc, SALT, () => {})).toThrow(/another transaction/);
    });
  });
});

describe('the derivation is pinned (F0)', () => {
  it('a fixed document and salt give a fixed id', () => {
    // If this changes, every build's lifts stop merging with this one's: a format change that
    // needs a new LIFT_ID_ALGORITHM, never an edit of the expected values.
    const doc = new Y.Doc();
    doc.clientID = 42;
    doc.getMap('pagesById').set('p1', 'x');
    doc.getMap('meta').set('schemaVersion', 3);
    doc.getMap('meta').delete('schemaVersion');
    expect(deterministicClientId(doc, 'salt ü € 𝄞')).toBe(1322104991787550);
    expect(deterministicClientId(doc, 'lift')).toBe(1403451316673095);
  });

  it('the bytes a lift writes are fixed (established with yjs 13.6.33, lib0 0.2.119)', () => {
    // Every class, nested values, unrepresentable keys left plain, a plain key. A change here
    // means a different lift for the same state and id: bump LIFT_ID_ALGORITHM, never the values.
    const doc = v3({
      shapeInstances: [
        { id: 's2', y: 2, x: 1, fill: { type: 'linear', stops: [0, 1] } },
        { id: 's1', x: 0 },
      ],
      layerOrder: ['s1', 's2'],
      lockedLayerIds: ['s2'],
      iconStates: { i2: { size: 1 }, i1: { color: 'red' } },
      templateRotations: { title: 5 },
      additionalTexts: [{ id: 'a' }, { id: 'a' }],
      headline: 'h',
    });
    const before = Y.encodeStateVector(doc);
    lift(doc);
    const bytes = Y.encodeStateAsUpdate(doc, before);
    expect([bytes.length, cyrb53(bytes)]).toEqual([GOLDEN_LENGTH, GOLDEN_HASH]);
  });
});

describe('Yjs with ids above 2^32 (yjs 13.6, lib0 0.2)', () => {
  it('encodes, decodes, merges and diffs them in both update formats', () => {
    const doc = v3({ shapeInstances: SHAPES });
    lift(doc);
    const derived = Array.from(Y.decodeStateVector(Y.encodeStateVector(doc)).keys()).find(
      isDerivedClientId
    )!;
    for (const [encode, apply] of [
      [Y.encodeStateAsUpdate, Y.applyUpdate],
      [Y.encodeStateAsUpdateV2, Y.applyUpdateV2],
    ] as const) {
      const copy = new Y.Doc();
      apply(copy, encode(doc));
      expect(readState(stateOf(copy))).toEqual(readState(stateOf(doc)));
      expect(Y.decodeStateVector(Y.encodeStateVector(copy)).get(derived)).toBeGreaterThan(0);
    }
    const merged = new Y.Doc();
    Y.applyUpdate(merged, Y.mergeUpdates([Y.encodeStateAsUpdate(doc)]));
    expect(readState(stateOf(merged))).toEqual(readState(stateOf(doc)));
    const diffed = new Y.Doc();
    Y.applyUpdate(diffed, Y.diffUpdate(Y.encodeStateAsUpdate(doc), new Uint8Array([0])));
    expect(readState(stateOf(diffed))).toEqual(readState(stateOf(doc)));
    expect(Y.parseUpdateMeta(Y.encodeStateAsUpdate(doc)).to.get(derived)).toBeGreaterThan(0);
  });
});
