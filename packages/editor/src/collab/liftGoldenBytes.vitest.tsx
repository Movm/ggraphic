// SPDX-License-Identifier: AGPL-3.0-only
/**
 * F0 guard of the deterministic lift identity (`DOCUMENT_VERSIONING.md`, "Version 4",
 * "Deterministic lift identity"): the exact bytes the open writes into a fixed version 3
 * document. The id is derived from the document state and the salt only; two builds that write
 * different bytes for the same state would share an id and diverge for good. So everything the
 * bytes depend on is frozen: the codec (`posBetween`, `representableProblem`,
 * `canonicalJsonValue`, `buildStructured`, the UTF-16 code-unit sort), what `migrateYDocument`
 * writes and in which order, each published host migration step's output, and Yjs's encoding.
 *
 * Established with yjs 13.6.33 and lib0 0.2.119. Any change of these values is a format change:
 * bump `LIFT_ID_ALGORITHM` (and the salt's tag) instead of updating the expected values.
 */
import { cyrb53 } from '@ggraphic/core/internal/ydoc/internal';
import { documentMigrations } from '@ggraphic/schema';
import { STAMP_V2_STEP } from '@ggraphic/schema/testing/v2Fixture';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { getMetaMap, getPagesMap, seedPagesIfEmpty, serializeDeck } from './pagesDoc.js';
import { useYjsPages } from './useYjsPages.js';
import { YDOC_KEYS } from './ydocKeys.js';
import { STAMP_KIND } from '../testing/stampKind.js';
import { registerElementKind, type ElementKindRegistration } from '../utils/elementKinds.js';

afterEach(() => documentMigrations.unregisterStateKey(STAMP_KIND.stateKey));

/** A version 3 document, built the same way every time (fixed client id, fixed write order). */
function fixture(): Y.Doc {
  const doc = new Y.Doc();
  doc.clientID = 500;
  seedPagesIfEmpty(doc, [
    { id: 'p1', configId: 'fixture-poster', state: {} },
    { id: 'p2', configId: 'fixture-poster', state: {} },
  ]);
  doc.transact(() => {
    const p1 = getPagesMap(doc).get('p1')!.get(YDOC_KEYS.state) as Y.Map<unknown>;
    p1.set('shapeInstances', [
      { id: 's2', x: 2, fill: { stops: [0, 1], type: 'linear' }, y: 20 },
      { id: 's1', x: 1, y: 10 },
    ]);
    p1.set('layerOrder', ['s1', 's2', 't1']);
    p1.set('lockedLayerIds', ['s2']);
    p1.set('iconStates', { i2: { color: 'blue' }, i1: { color: 'red', size: 3 } });
    p1.set('templateTextAligns', { title: 'left' });
    p1.set('additionalTexts', [{ id: 't1', text: 'Hallo', runs: [{ text: 'Ha', bold: true }] }]);
    p1.set('headline', 'Eins');
    p1.set(STAMP_KIND.stateKey, [{ id: 'st1', label: 'A', offset: { x: 1, y: 2 } }]);
    const p2 = getPagesMap(doc).get('p2')!.get(YDOC_KEYS.state) as Y.Map<unknown>;
    p2.set('shapeInstances', [{ id: 'z', x: 5 }]);
    p2.set('selectedIcons', ['i9', 'i3']);
    const config = new Y.Map<unknown>();
    config.set('width', 1080);
    config.set('height', 1350);
    getPagesMap(doc).get('p2')!.set(YDOC_KEYS.config, config);
    getMetaMap(doc).set(YDOC_KEYS.schemaVersion, 3);
    getMetaMap(doc).set(YDOC_KEYS.formStateFolded, true);
  });
  return doc;
}

describe('the bytes of the deterministic lift (F0)', () => {
  it('are fixed for a fixed document, with a host kind migration in the lift', () => {
    registerElementKind({
      ...(STAMP_KIND as unknown as ElementKindRegistration<never>),
      migrations: [STAMP_V2_STEP],
    });
    const doc = fixture();
    // A replica that got the same document as one update writes the same bytes: the result
    // depends on the state, not on how a replica came by it. One that keeps deleted content
    // (`gc: false`) encodes an item the lift wrote and then replaced with its content, so its
    // bytes are longer; its structs are the same ones (same ids), and it converges.
    const replica = new Y.Doc();
    replica.clientID = 1;
    const keeping = new Y.Doc({ gc: false });
    keeping.clientID = 2;
    for (const d of [replica, keeping]) Y.applyUpdate(d, Y.encodeStateAsUpdate(doc));
    const before = Y.encodeStateVector(doc);
    for (const d of [doc, replica, keeping]) {
      renderHook(() => useYjsPages(d, true, null, true)).unmount();
    }
    const bytes = Y.encodeStateAsUpdate(doc, before);
    expect(Y.encodeStateAsUpdate(replica, before)).toEqual(bytes);
    expect(Y.encodeStateVector(keeping)).toEqual(Y.encodeStateVector(doc));
    Y.applyUpdate(keeping, bytes);
    expect(Y.encodeStateVector(keeping)).toEqual(Y.encodeStateVector(doc));
    expect(JSON.stringify(serializeDeck(keeping))).toBe(JSON.stringify(serializeDeck(doc)));
    // The step and the lift ran: the stamps are migrated, the collections structured.
    const p1 = getPagesMap(doc).get('p1')!.get(YDOC_KEYS.state) as Y.Map<unknown>;
    expect(p1.get('shapeInstances')).toBeInstanceOf(Y.Map);
    expect(getMetaMap(doc).get(`${YDOC_KEYS.kindVersionPrefix}${STAMP_KIND.stateKey}`)).toBe(2);
    // Do not update these values: a different result is a different lift (see the header).
    expect([bytes.length, cyrb53(bytes)]).toEqual([937, 4064647754151126]);
  });
});
