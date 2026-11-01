// SPDX-License-Identifier: MPL-2.0
/**
 * The page-level history (page ops, `replaceDeck`) stamps each step from the
 * one history clock, so Undo and Redo can walk it together with the pages'
 * element histories (`utils/historyStamp`). A step keeps its stamp through
 * Undo and Redo: it is when the step was TAKEN, not when it was undone.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { getMetaMap } from './pagesDoc.js';
import { useYjsPages } from './useYjsPages.js';
import { YDOC_KEYS } from './ydocKeys.js';
import { nextHistoryStamp } from '../utils/historyStamp.js';

function setup() {
  const doc = new Y.Doc();
  const pages = renderHook(() => useYjsPages(doc, true));
  act(() =>
    pages.result.current!.seedIfEmpty([
      { configId: 'creator', state: { headline: 'Eins' } },
      { configId: 'creator', state: { headline: 'Zwei' } },
    ])
  );
  const api = () => pages.result.current!;
  const addPage = (id: string) =>
    act(() => api().addPage({ id, configId: 'creator', state: { headline: id } }));
  const replace = (headline: string) =>
    act(() =>
      api().replaceDeck({
        updates: [{ pageId: api().pages[0]!.id, state: { headline } }],
        inserts: [],
        removes: [],
      })
    );
  return { doc, pages, api, addPage, replace };
}

describe('pageOpStamps', () => {
  it('has no stamps before the first step, and the seed is not one', () => {
    const { api } = setup();
    expect(api().pageOpStamps()).toEqual({ undo: null, redo: null });
  });

  it('stamps each step from the history clock, newer steps later', () => {
    const { api, addPage, replace } = setup();
    const before = nextHistoryStamp();
    addPage('Drei');
    const addStamp = api().pageOpStamps().undo!;
    replace('Neu');
    const replaceStamp = api().pageOpStamps().undo!;
    const after = nextHistoryStamp();

    expect(addStamp).toBeGreaterThan(before);
    expect(replaceStamp).toBeGreaterThan(addStamp);
    expect(after).toBeGreaterThan(replaceStamp);
  });

  it('puts a step between two element edits where it was taken', () => {
    const { api, replace } = setup();
    const olderElementEdit = nextHistoryStamp();
    replace('Neu');
    const newerElementEdit = nextHistoryStamp();

    const { undo } = api().pageOpStamps();
    expect(olderElementEdit).toBeLessThan(undo!);
    expect(undo!).toBeLessThan(newerElementEdit);
  });

  it('keeps the stamp of a step through Undo and Redo', () => {
    const { api, addPage, replace } = setup();
    addPage('Drei');
    const addStamp = api().pageOpStamps().undo!;
    replace('Neu');
    const replaceStamp = api().pageOpStamps().undo!;

    act(() => api().undoPageOp());
    expect(api().pageOpStamps()).toEqual({ undo: addStamp, redo: replaceStamp });

    act(() => api().undoPageOp());
    expect(api().pageOpStamps()).toEqual({ undo: null, redo: addStamp });

    act(() => api().redoPageOp());
    expect(api().pageOpStamps()).toEqual({ undo: addStamp, redo: replaceStamp });

    act(() => api().redoPageOp());
    expect(api().pageOpStamps()).toEqual({ undo: replaceStamp, redo: null });
  });

  it('is read at call time, from the same function the api handed out before', () => {
    const { api, addPage } = setup();
    const read = api().pageOpStamps;
    expect(read().undo).toBeNull();
    addPage('Drei');
    expect(read().undo).not.toBeNull();
  });

  it('has no redo stamp after Verwerfen of a replaced deck', () => {
    const { api, replace } = setup();
    replace('Neu');
    act(() => api().discardReplaceDeck());
    expect(api().pageOpStamps()).toEqual({ undo: null, redo: null });
  });

  it('has no stamps on a doc this build must not write', () => {
    const doc = new Y.Doc();
    getMetaMap(doc).set(YDOC_KEYS.schemaVersion, 99);
    const { result } = renderHook(() => useYjsPages(doc, true));
    expect(result.current!.schemaRefusal).not.toBeNull();
    expect(result.current!.pageOpStamps()).toEqual({ undo: null, redo: null });
  });
});
