// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The open of a writing client lifts under the deterministic lift identity: two replicas of one
 * document state, opened by this build, write byte-identical structs, also when a host kind's
 * migration rewrites data in the same transaction and the replicas iterate their maps in
 * different orders. A server-created document (seeded structured and stamped 4) is not written at
 * all, and the legacy lifts, which are not deterministic, run before, under the client's own id.
 */
import { STAMP_V2_STEP } from '@ggraphic/schema/testing/v2Fixture';
import { documentMigrations } from '@ggraphic/schema';
import { isDerivedClientId } from '@ggraphic/core/ydoc';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  PAGE_ID,
  SHAPES,
  isStructured,
  pageState,
  schemaVersionOf,
  shape,
  stateMapOf,
  v3Doc,
} from './__tests__/elementStorageKit.js';
import { stampYDocument } from './documentVersion.js';
import { getMetaMap, getPagesMap, seedPagesIfEmpty, serializeDeck } from './pagesDoc.js';
import { useYjsPages } from './useYjsPages.js';
import { YDOC_KEYS } from './ydocKeys.js';
import { STAMP_KIND } from '../testing/stampKind.js';
import { registerElementKind, type ElementKindRegistration } from '../utils/elementKinds.js';

afterEach(() => documentMigrations.unregisterStateKey(STAMP_KIND.stateKey));

const openWriting = (doc: Y.Doc) => renderHook(() => useYjsPages(doc, true, null, true));
const replica = (doc: Y.Doc, clientID: number) => {
  const copy = new Y.Doc();
  copy.clientID = clientID;
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
};
const since = (doc: Y.Doc, base: Y.Doc) => Y.encodeStateAsUpdate(doc, Y.encodeStateVector(base));
const derivedIds = (doc: Y.Doc) =>
  Array.from(Y.decodeStateVector(Y.encodeStateVector(doc)).keys()).filter(isDerivedClientId);

describe('the open lifts under the deterministic identity', () => {
  it('two replicas of one version 3 state write identical structs', () => {
    const doc = v3Doc([
      {
        id: PAGE_ID,
        configId: 'fixture-poster',
        state: {
          [SHAPES]: [shape('s1', 1), shape('s2', 2)],
          layerOrder: ['s2', 's1'],
          iconStates: { i1: { color: 'red' } },
          headline: 'Eins',
        },
      },
      { id: 'p2', configId: 'fixture-poster', state: { [SHAPES]: [shape('z', 3)] } },
    ]);
    const a = replica(doc, 1);
    const b = replica(doc, 2);
    openWriting(a);
    openWriting(b);
    expect(isStructured(a, SHAPES)).toBe(true);
    expect(since(a, doc)).toEqual(since(b, doc));
    expect(derivedIds(a)).toHaveLength(1);
    expect(derivedIds(a)).toEqual(derivedIds(b));
    // Nothing of the open is under the clients' own ids.
    for (const [d, own] of [
      [a, 1],
      [b, 2],
    ] as const) {
      expect(Y.decodeStateVector(Y.encodeStateVector(d)).has(own)).toBe(false);
    }
  });

  it('also with a host kind migration rewriting data, on replicas that iterate differently', () => {
    registerElementKind({
      ...(STAMP_KIND as unknown as ElementKindRegistration<never>),
      migrations: [STAMP_V2_STEP],
    });
    // The stamps' list and the shapes arrive at the two replicas in opposite orders.
    const doc = v3Doc([{ id: PAGE_ID, configId: 'fixture-poster', state: { headline: 'h' } }]);
    const w1 = replica(doc, 11);
    const w2 = replica(doc, 12);
    stateMapOf(w1).set(STAMP_KIND.stateKey, [
      { id: 'st1', label: 'A', offset: { x: 1, y: 2 } },
      { id: 'st2', label: 'B', offset: { x: 3, y: 4 } },
    ]);
    stateMapOf(w2).set(SHAPES, [shape('s1', 1)]);
    const [u1, u2] = [since(w1, doc), since(w2, doc)];
    const a = replica(doc, 1);
    const b = replica(doc, 2);
    Y.applyUpdate(a, u1);
    Y.applyUpdate(a, u2);
    Y.applyUpdate(b, u2);
    Y.applyUpdate(b, u1);
    expect(Array.from(stateMapOf(a).keys())).not.toEqual(Array.from(stateMapOf(b).keys()));
    const before = Y.encodeStateVector(a);
    expect(Y.encodeStateVector(b)).toEqual(before);

    openWriting(a);
    openWriting(b);
    // The kind step ran (offset → position) and lifted, identically on both.
    expect(pageState(a)[STAMP_KIND.stateKey]).toEqual([
      { id: 'st1', label: 'A', position: { x: 1, y: 2 } },
      { id: 'st2', label: 'B', position: { x: 3, y: 4 } },
    ]);
    expect(getMetaMap(a).get(`${YDOC_KEYS.kindVersionPrefix}${STAMP_KIND.stateKey}`)).toBe(2);
    // The structs both opens wrote, relative to their common state before: byte-identical.
    expect(Y.encodeStateAsUpdate(a, before)).toEqual(Y.encodeStateAsUpdate(b, before));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
    expect(serializeDeck(a)).toEqual(serializeDeck(b));
  });

  it('a server-created document (seeded structured, stamped 4) is not written', () => {
    const server = new Y.Doc();
    server.transact(() => {
      stampYDocument(server);
      seedPagesIfEmpty(server, [
        { id: PAGE_ID, configId: 'fixture-poster', state: { [SHAPES]: [shape('s1', 1)] } },
      ]);
      getMetaMap(server).set(YDOC_KEYS.formStateFolded, true);
    });
    expect(isStructured(server, SHAPES)).toBe(true);
    const client = replica(server, 1);
    const updates: Uint8Array[] = [];
    client.on('update', (u: Uint8Array) => updates.push(u));
    openWriting(client);
    expect(updates).toEqual([]);
    expect(derivedIds(client)).toEqual([]);
  });

  it('a legacy document: the legacy lift runs under the own id, the stamp and lift after it', () => {
    const doc = new Y.Doc();
    doc.clientID = 7;
    doc.getMap(YDOC_KEYS.legacyRoot).set('headline', 'alt');
    const transactions: { client: number[] }[] = [];
    doc.on('afterTransaction', (tr: Y.Transaction) => {
      if (tr.changed.size === 0) return;
      const after = tr.afterState;
      transactions.push({
        client: Array.from(after.keys()).filter(
          (c) => (tr.beforeState.get(c) ?? 0) < after.get(c)!
        ),
      });
    });
    openWriting(doc);
    expect(getPagesMap(doc).size).toBe(1);
    expect(schemaVersionOf(doc)).toBe(4);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]!.client).toEqual([7]);
    expect(transactions[1]!.client.every(isDerivedClientId)).toBe(true);
  });
});
