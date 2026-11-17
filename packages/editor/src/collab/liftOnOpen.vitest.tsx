// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Opening a document at version 3 with a writing client lifts every classed key to its Yjs
 * structure and raises the stamp to 4, in ONE transaction that no undo stack tracks
 * (`packages/schema/DOCUMENT_VERSIONING.md`, "Version 4", "Lift and re-lift"). The JSON view does
 * not change. Previews and refused clients never lift; old-shape data under a version 4 stamp is
 * read as it is and lifted again on the next open.
 */
import { createMigrationRegistry } from '@ggraphic/schema';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  PAGE_ID,
  SHAPES,
  deckJson,
  isStructured,
  kindOf,
  linkedDocs,
  replicaOf,
  schemaVersionOf,
  shape,
  stateMapOf,
  v3Doc,
  v4Doc,
} from './__tests__/elementStorageKit.js';
import { readYDocRefusal } from './documentVersion.js';
import { getMetaMap, readPages, serializeDeck } from './pagesDoc.js';
import { YDOC_KEYS } from './ydocKeys.js';
import { usePageManager } from '../hooks/usePageManager.js';

const STATE = {
  headline: 'Eins',
  [SHAPES]: [shape('s1', 100), shape('s2', 200)],
  additionalTexts: [{ id: 't1', text: 'Hallo', x: 5, y: 6 }],
  layerOrder: ['s1', 's2', 't1'],
  lockedLayerIds: ['s2'],
  selectedIcons: [],
  iconStates: { i1: { color: '#005538' } },
  templateRotations: { title: 5 },
  templateTextAligns: { title: 'left' },
  groups: [{ id: 'g1', memberIds: ['s1', 's2'] }],
};
const CLASSES: Record<string, string> = {
  [SHAPES]: 'elements',
  additionalTexts: 'elements',
  layerOrder: 'order',
  lockedLayerIds: 'order',
  selectedIcons: 'order',
  iconStates: 'record',
  templateRotations: 'record',
  templateTextAligns: 'record',
};
const PLAIN_KEYS = ['headline', 'groups'];

const pages = (state: Record<string, unknown> = STATE) => [
  { id: PAGE_ID, configId: 'fixture-poster', state },
];
const v3 = (state?: Record<string, unknown>) => v3Doc(pages(state));

function open(doc: Y.Doc, isSynced = true) {
  return renderHook(
    (props: { isSynced: boolean }) =>
      usePageManager({
        initialConfigId: 'fixture-poster',
        initialProps: {},
        collaborative: { ydoc: doc, isSynced: props.isSynced },
      }),
    { initialProps: { isSynced } }
  );
}

const recordUpdates = (doc: Y.Doc) => {
  const updates: Uint8Array[] = [];
  doc.on('update', (u: Uint8Array) => updates.push(u));
  return updates;
};
const countWritingTransactions = (doc: Y.Doc) => {
  const seen = { n: 0 };
  doc.on('afterTransaction', (tr: Y.Transaction) => {
    if (tr.changed.size > 0) seen.n += 1;
  });
  return seen;
};

describe('opening a version 3 document with a writing client', () => {
  it('lifts every classed key and leaves the plain ones', () => {
    const doc = v3();
    for (const key of Object.keys(CLASSES)) expect(isStructured(doc, key)).toBe(false);
    open(doc);
    for (const [key, kind] of Object.entries(CLASSES)) {
      expect(isStructured(doc, key), key).toBe(true);
      expect(kindOf(doc, key), key).toBe(kind);
    }
    for (const key of PLAIN_KEYS) expect(isStructured(doc, key), key).toBe(false);
  });

  it('writes the lift and the stamp 4 in one update and one transaction', () => {
    const doc = v3();
    const replica = replicaOf(doc);
    const updates = recordUpdates(doc);
    const transactions = countWritingTransactions(doc);
    open(doc);

    expect(schemaVersionOf(doc)).toBe(4);
    expect(transactions.n).toBe(1);
    expect(updates).toHaveLength(1);
    // A peer that receives that single update has the stamp and the structure together.
    Y.applyUpdate(replica, updates[0]!);
    expect(schemaVersionOf(replica)).toBe(4);
    expect(isStructured(replica, SHAPES)).toBe(true);
    expect(isStructured(replica, 'layerOrder')).toBe(true);
  });

  it('does not change the JSON view', () => {
    const doc = v3();
    const before = deckJson(doc);
    open(doc);
    expect(deckJson(doc)).toEqual(before);
    expect(readPages(doc)[0]!.state).toEqual(STATE);
  });

  it('is not an undo step: undo right after open does nothing', () => {
    const doc = v3();
    const { result } = open(doc);
    expect(result.current.canUndoPageOp).toBe(false);
    const before = deckJson(doc);
    act(() => result.current.undoPageOp());
    expect(deckJson(doc)).toEqual(before);
    expect(schemaVersionOf(doc)).toBe(4);
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(result.current.isPreview).toBe(false);
  });

  it('writes nothing on the second open', () => {
    const doc = v3();
    open(doc).unmount();
    expect(isStructured(doc, SHAPES)).toBe(true);
    const updates = recordUpdates(doc);
    const { result } = open(doc);
    expect(result.current.isPreview).toBe(false);
    expect(updates).toEqual([]);
  });

  it('leaves a value the structure cannot represent plain, on every open', () => {
    const doc = v3({
      ...STATE,
      // duplicate ids, an id with the reserved prefix, a record key with it
      [SHAPES]: [shape('s1', 1), shape('s1', 2)],
      additionalTexts: [{ id: '$t', text: 'x' }],
      iconStates: { $i: { color: 'red' } },
    });
    const before = deckJson(doc);
    open(doc).unmount();
    expect(isStructured(doc, SHAPES)).toBe(false);
    expect(isStructured(doc, 'additionalTexts')).toBe(false);
    expect(isStructured(doc, 'iconStates')).toBe(false);
    expect(isStructured(doc, 'layerOrder')).toBe(true);
    expect(schemaVersionOf(doc)).toBe(4);

    const updates = recordUpdates(doc);
    open(doc);
    expect(updates).toEqual([]);
    expect(deckJson(doc)).toEqual(before);
  });

  it('two clients opening the same document at once converge to one structure and the same JSON', async () => {
    const { a, b, flush } = linkedDocs((clientID) => v3Doc(pages(), clientID));
    const before = deckJson(a);
    open(a);
    open(b);
    await flush();

    for (const doc of [a, b]) {
      expect(schemaVersionOf(doc)).toBe(4);
      for (const key of Object.keys(CLASSES)) expect(isStructured(doc, key), key).toBe(true);
    }
    expect(deckJson(a)).toEqual(before);
    expect(deckJson(b)).toEqual(before);
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
  });

  it('a client that is not synced does not lift; once synced it does', () => {
    const doc = v3();
    const updates = recordUpdates(doc);
    const { result, rerender } = open(doc, false);
    expect(updates).toEqual([]);
    expect(isStructured(doc, SHAPES)).toBe(false);
    expect(result.current.isPreview).toBe(true);

    rerender({ isSynced: true });
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(schemaVersionOf(doc)).toBe(4);
  });

  it('a refused client (a newer document) does not lift', () => {
    const doc = v3();
    getMetaMap(doc).set(YDOC_KEYS.schemaVersion, 5);
    const updates = recordUpdates(doc);
    const { result } = open(doc);
    expect(result.current.isPreview).toBe(true);
    expect(result.current.schemaRefusal).toMatchObject({ status: 'newer', version: 5 });
    expect(updates).toEqual([]);
    expect(isStructured(doc, SHAPES)).toBe(false);
  });

  it('seeding an empty document creates it structured and stamped 4 in one transaction', () => {
    const doc = new Y.Doc();
    const transactions = countWritingTransactions(doc);
    renderHook(() =>
      usePageManager({
        initialConfigId: 'fixture-poster',
        initialProps: { [SHAPES]: [shape('s1', 100)], layerOrder: ['s1'] },
        collaborative: { ydoc: doc, isSynced: true },
      })
    );
    expect(schemaVersionOf(doc)).toBe(4);
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(isStructured(doc, 'layerOrder')).toBe(true);
    expect(transactions.n).toBe(1);
  });
});

describe('old-shape data under a version 4 stamp', () => {
  /** What an old writer does: it sets the whole plain value under a structured key. */
  function oldWriterTouches(doc: Y.Doc) {
    const stateY = stateMapOf(doc);
    doc.transact(() => {
      stateY.set(SHAPES, [shape('s1', 100), shape('s2', 777)]);
      stateY.set('layerOrder', ['s2', 's1']);
    }, 'old-writer');
  }
  const V4_STATE = { ...STATE, [SHAPES]: [shape('s1', 100), shape('s2', 200)] };
  const EXPECTED = {
    ...V4_STATE,
    [SHAPES]: [shape('s1', 100), shape('s2', 777)],
    layerOrder: ['s2', 's1'],
  };

  it('is read correctly, next to the structures that are still there', () => {
    const doc = v4Doc(pages(V4_STATE));
    oldWriterTouches(doc);
    expect(isStructured(doc, SHAPES)).toBe(false);
    expect(isStructured(doc, 'additionalTexts')).toBe(true);
    expect(serializeDeck(doc)[0]!.state).toEqual(EXPECTED);
  });

  it('is lifted again on the next open: same JSON, one update, no undo step', () => {
    const doc = v4Doc(pages(V4_STATE));
    oldWriterTouches(doc);
    const updates = recordUpdates(doc);
    const { result } = open(doc);

    expect(result.current.isPreview).toBe(false);
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(isStructured(doc, 'layerOrder')).toBe(true);
    expect(serializeDeck(doc)[0]!.state).toEqual(EXPECTED);
    expect(updates).toHaveLength(1);
    expect(result.current.canUndoPageOp).toBe(false);
    expect(schemaVersionOf(doc)).toBe(4);
  });
});

describe('a client whose build knows only version 3', () => {
  // `readYDocRefusal(doc, registry)` is the check that build runs; a mounted page manager cannot
  // be pinned to another registry, so this drives the same check around the update.
  const v3Registry = () =>
    createMigrationRegistry([
      { from: 1, migrate: (doc) => doc },
      { from: 2, migrate: (doc) => doc },
    ]);

  it('goes read-only on the very update that brings the lift', () => {
    const doc = v3();
    const old = replicaOf(doc);
    const registry = v3Registry();
    expect(readYDocRefusal(old, registry)).toBeNull();

    const updates = recordUpdates(doc);
    open(doc);
    expect(updates).toHaveLength(1);

    const seen: { refusal: unknown; structured: boolean }[] = [];
    old.on('afterTransaction', () =>
      seen.push({ refusal: readYDocRefusal(old, registry), structured: isStructured(old, SHAPES) })
    );
    Y.applyUpdate(old, updates[0]!, 'remote');

    // The first moment this client sees a structure, it already refuses the document.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.structured).toBe(true);
    expect(seen[0]!.refusal).toMatchObject({ status: 'newer', version: 4, known: 3 });
  });

  it('goes read-only when the stamp rises to 4 while it is open (the meta observer)', () => {
    const doc = v3();
    const old = replicaOf(doc);
    const registry = v3Registry();
    const refusals: unknown[] = [];
    getMetaMap(old).observe(() => refusals.push(readYDocRefusal(old, registry)));

    const updates = recordUpdates(doc);
    open(doc);
    for (const update of updates) Y.applyUpdate(old, update, 'remote');

    expect(refusals.at(-1)).toMatchObject({ status: 'newer', version: 4 });
  });
});
