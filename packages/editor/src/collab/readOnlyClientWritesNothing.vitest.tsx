// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A client that may not write the document (a read-only share: `collaborative.canWrite: false`)
 * writes nothing, not even on open: no version 4 lift, no stamp, no legacy lift, no seed, and
 * every page op is a no-op. Its pages stay live, so it follows the writers' edits.
 *
 * Why it matters (review of #211, finding 1): a viewer that lifted locally, while its server
 * dropped the update, kept its own unsent structure winning at key level over the writer's lift,
 * so its view froze; and its cached updates, reaching the server later, would revert everyone's
 * edits. A writing client is unaffected, and a host that does not say lifts nothing on open.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  PAGE_ID,
  SHAPES,
  isStructured,
  pageState,
  schemaVersionOf,
  shape,
  v3Doc,
  xOf,
} from './__tests__/elementStorageKit.js';
import { getMetaMap } from './pagesDoc.js';
import { YDOC_KEYS } from './ydocKeys.js';
import { usePageManager } from '../hooks/usePageManager.js';

const STATE = { [SHAPES]: [shape('s1', 100)], layerOrder: ['s1'], headline: 'Eins' };
const serverDoc = () => v3Doc([{ id: PAGE_ID, configId: 'fixture-poster', state: STATE }], 500);

const replicaOf = (server: Y.Doc, clientID: number) => {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(server));
  return doc;
};

/** Every update a doc produces itself (not the ones delivered to it). */
const ownUpdates = (doc: Y.Doc) => {
  const updates: Uint8Array[] = [];
  doc.on('update', (u: Uint8Array, origin: unknown) => origin !== 'net' && updates.push(u));
  return updates;
};

const open = (doc: Y.Doc, canWrite?: boolean) =>
  renderHook(() =>
    usePageManager({
      initialConfigId: 'fixture-poster',
      initialProps: { [SHAPES]: [shape('seeded', 1)] },
      collaborative: {
        ydoc: doc,
        isSynced: true,
        ...(canWrite === undefined ? {} : { canWrite }),
      },
    })
  );

describe('a client that may not write (canWrite: false)', () => {
  it('stays in step with a writer and writes zero updates (the review scenario)', () => {
    const server = serverDoc();
    const viewer = replicaOf(server, 9);
    const viewerWrites = ownUpdates(viewer);
    const { result } = open(viewer, false);

    expect(viewerWrites).toEqual([]);
    expect(isStructured(viewer, SHAPES)).toBe(false);
    expect(schemaVersionOf(viewer)).toBe(3);
    expect(result.current.isPreview).toBe(false);
    expect(result.current.pages[0]!.state).toEqual(STATE);

    // A writer opens from the server, lifts, edits; the server relays it to the viewer.
    const writer = replicaOf(server, 1);
    const { result: writing } = open(writer, true);
    expect(isStructured(writer, SHAPES)).toBe(true);
    act(() => writing.current.updatePageState(PAGE_ID, { [SHAPES]: [shape('s1', 777)] }));
    Y.applyUpdate(server, Y.encodeStateAsUpdate(writer));
    act(() => Y.applyUpdate(viewer, Y.encodeStateAsUpdate(server), 'net'));

    expect(xOf(pageState(server), 's1')).toBe(777);
    expect(xOf(pageState(viewer), 's1')).toBe(777);
    expect(xOf(result.current.pages[0]!.state, 's1')).toBe(777);
    expect(isStructured(viewer, SHAPES)).toBe(true);
    expect(viewerWrites).toEqual([]);
  });

  it('turns every page op into a no-op', async () => {
    const viewer = replicaOf(serverDoc(), 9);
    const viewerWrites = ownUpdates(viewer);
    const { result } = open(viewer, false);
    await act(async () => {
      result.current.updatePageState(PAGE_ID, { headline: 'Zwei' });
      result.current.duplicatePage(PAGE_ID);
      result.current.movePage(PAGE_ID, 'down');
      result.current.removePage(PAGE_ID);
      await result.current.addPage('fixture-poster');
      result.current.undoPageOp();
    });
    expect(result.current.replaceDeck).not.toBeNull();
    act(() => {
      result.current.replaceDeck!({ updates: [], inserts: [], removes: [PAGE_ID] });
    });
    expect(viewerWrites).toEqual([]);
    expect(pageState(viewer)).toEqual(STATE);
  });

  it('runs neither the legacy lift nor the seed of an empty document', () => {
    const empty = new Y.Doc();
    empty.getMap(YDOC_KEYS.formState).set('headline', 'alt');
    const writes = ownUpdates(empty);
    open(empty, false);
    expect(writes).toEqual([]);
    expect(empty.getMap(YDOC_KEYS.pagesById).size).toBe(0);
  });

  it('lifts once it may write', () => {
    const doc = replicaOf(serverDoc(), 9);
    const { rerender } = renderHook(
      (props: { canWrite: boolean }) =>
        usePageManager({
          initialConfigId: 'fixture-poster',
          initialProps: {},
          collaborative: { ydoc: doc, isSynced: true, canWrite: props.canWrite },
        }),
      { initialProps: { canWrite: false } }
    );
    expect(isStructured(doc, SHAPES)).toBe(false);
    rerender({ canWrite: true });
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(schemaVersionOf(doc)).toBe(4);
  });
});

describe('a writing client (canWrite: true)', () => {
  it('lifts on open and writes structured', () => {
    const doc = replicaOf(serverDoc(), 1);
    const { result } = open(doc, true);
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(schemaVersionOf(doc)).toBe(4);
    act(() => result.current.updatePageState(PAGE_ID, { [SHAPES]: [shape('s1', 5)] }));
    expect(xOf(pageState(doc), 's1')).toBe(5);
    expect(isStructured(doc, SHAPES)).toBe(true);
  });
});

describe('a host that does not pass canWrite', () => {
  it('does not lift on open; a key it writes becomes structured', () => {
    const doc = replicaOf(serverDoc(), 1);
    const { result } = open(doc);
    // The version steps run as before element storage; the lift does not.
    expect(schemaVersionOf(doc)).toBe(4);
    expect(getMetaMap(doc).get(YDOC_KEYS.schemaVersion)).toBe(4);
    expect(isStructured(doc, SHAPES)).toBe(false);
    expect(isStructured(doc, 'layerOrder')).toBe(false);
    act(() => result.current.updatePageState(PAGE_ID, { [SHAPES]: [shape('s1', 5)] }));
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(isStructured(doc, 'layerOrder')).toBe(false);
  });
});
