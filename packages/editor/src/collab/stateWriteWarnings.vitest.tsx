// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The editor reports a page-state key written plain because its value cannot be a structure
 * (review of #211, finding 4) to the host's `onStateWriteWarning` listeners, once per page and
 * key, with the document, and with `console.warn` while no listener is registered. The write
 * itself is unchanged. A listener runs only after the write is over, so one that writes to the
 * document writes under the client's own id, and one that throws changes nothing (review of the
 * deterministic lift, finding 1).
 */
import { isDerivedClientId } from '@ggraphic/core/internal/ydoc/internal';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { schemaVersionOf, v3Doc } from './__tests__/elementStorageKit.js';
import { stampYDocument } from './documentVersion.js';
import { readPages, seedPagesIfEmpty, updatePageStateById } from './pagesDoc.js';
import { useYjsPages } from './useYjsPages.js';
import { onStateWriteWarning, type StateWriteWarning } from './stateWriteWarnings.js';
import { YDOC_KEYS } from './ydocKeys.js';

function v4Doc() {
  const doc = new Y.Doc();
  doc.transact(() => {
    stampYDocument(doc);
    seedPagesIfEmpty(doc, [
      { id: 'p1', configId: 'fixture-poster', state: { shapeInstances: [{ id: 'a', x: 1 }] } },
    ]);
  });
  return doc;
}
const DUPLICATE = [
  { id: 'a', x: 1 },
  { id: 'a', x: 2 },
];

let unsubscribe: (() => void) | null = null;
afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
  vi.restoreAllMocks();
});

describe('a classed key written plain', () => {
  it('reaches the host listener once, and the write is stored plain', () => {
    const seen: StateWriteWarning[] = [];
    unsubscribe = onStateWriteWarning((w) => seen.push(w));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = v4Doc();
    seen.length = 0;
    updatePageStateById(doc, 'p1', { shapeInstances: DUPLICATE });
    updatePageStateById(doc, 'p1', { shapeInstances: [...DUPLICATE, { id: 'b' }] });
    expect(seen).toEqual([
      {
        kind: 'plain-fallback',
        doc,
        key: 'shapeInstances',
        keyClass: 'elements',
        reason: "[1] repeats the id 'a'",
        replaced: true,
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
    const stateY = readPages(doc)[0]!.yMap.get(YDOC_KEYS.state) as Y.Map<unknown>;
    expect(Array.isArray(stateY.get('shapeInstances'))).toBe(true);
  });

  it('goes to console.warn while no listener is registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    updatePageStateById(v4Doc(), 'p1', { shapeInstances: DUPLICATE });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("'shapeInstances' is stored as plain JSON");
  });
});

describe('a listener', () => {
  const PAGE = 'seed-0';
  const pages = () => [
    {
      id: PAGE,
      configId: 'fixture-poster',
      state: { shapeInstances: DUPLICATE, layerOrder: ['a'], additionalTexts: [{ id: 't' }] },
    },
  ];
  const replica = (src: Y.Doc, clientID: number) => {
    const doc = new Y.Doc();
    doc.clientID = clientID;
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(src));
    return doc;
  };
  const stateMap = (doc: Y.Doc) => readPages(doc)[0]!.yMap.get(YDOC_KEYS.state) as Y.Map<unknown>;

  it('that writes during the open writes under the client’s own id; the replicas converge', () => {
    const base = v3Doc(pages(), 999);
    const [a, b] = [replica(base, 1), replica(base, 2)];
    const seenIds: number[] = [];
    unsubscribe = onStateWriteWarning((w) => {
      seenIds.push(w.doc.clientID);
      updatePageStateById(w.doc, PAGE, { lastWarning: `${w.key}-${w.doc.clientID}` });
    });
    for (const doc of [a, b]) renderHook(() => useYjsPages(doc, true, null, true)).unmount();
    expect(seenIds).toEqual([1, 2]);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
    expect(readPages(a)[0]!.state).toEqual(readPages(b)[0]!.state);
    const ids = Array.from(Y.decodeStateVector(Y.encodeStateVector(a)).keys());
    expect(ids.filter(isDerivedClientId)).toHaveLength(1);
  });

  it('that throws during the open: the open completes, the error is logged', () => {
    const doc = replica(v3Doc(pages(), 999), 1);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    unsubscribe = onStateWriteWarning(() => {
      throw new Error('telemetry down');
    });
    expect(() => renderHook(() => useYjsPages(doc, true, null, true)).unmount()).not.toThrow();
    expect(schemaVersionOf(doc)).toBe(4);
    expect(stateMap(doc).get('layerOrder')).toBeInstanceOf(Y.Map);
    expect(stateMap(doc).get('additionalTexts')).toBeInstanceOf(Y.Map);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('that throws during a user write: every key of the write is written', () => {
    const doc = v4Doc();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    unsubscribe = onStateWriteWarning(() => {
      throw new Error('telemetry down');
    });
    expect(() =>
      updatePageStateById(doc, 'p1', {
        headline: 'new',
        shapeInstances: [{ id: 'q' }, { id: 'q' }],
        additionalTexts: [{ id: 't' }],
      })
    ).not.toThrow();
    const state = readPages(doc)[0]!.state;
    expect(state['headline']).toBe('new');
    expect(state['additionalTexts']).toEqual([{ id: 't' }]);
  });

  it('that writes during a user write runs after it, in a transaction of its own', () => {
    const doc = v4Doc();
    const transactions: number[] = [];
    doc.on('afterTransaction', (tr: Y.Transaction) => tr.changed.size > 0 && transactions.push(1));
    unsubscribe = onStateWriteWarning((w) => {
      expect(w.doc._transaction).toBeNull();
      updatePageStateById(w.doc, 'p1', { lastWarning: w.key });
    });
    updatePageStateById(doc, 'p1', { shapeInstances: DUPLICATE });
    expect(readPages(doc)[0]!.state['lastWarning']).toBe('shapeInstances');
    expect(transactions).toHaveLength(2);
  });
});
