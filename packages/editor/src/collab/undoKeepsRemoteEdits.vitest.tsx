// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Undo reverts this client's own steps only (#160). Another client's edit that
 * arrived in between must survive it, in this canvas and in the shared
 * document — even when both edits sit in the same state key (one
 * `shapeInstances` array holds every shape).
 */
import { pagePersistedStateKeys } from './pageElementStateKeys.js';
import { readPages, seedPagesIfEmpty, updatePageStateById } from './pagesDoc.js';
import { PAGES_STATE_ORIGIN } from './useYjsPages.js';
import { createPageSyncedCallbacks } from './wrapCallbacksWithPageSync.js';
import { GenericCanvas, type GenericCanvasRef } from '../components/GenericCanvas.js';
import { loadCanvasConfig } from '../configs/configLoader.js';
import '../testing/fixtureTemplates';
import { AutoSaveStoreProvider } from '../stores/AutoSaveStoreProvider.js';

import { act, render } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import type * as StoreModule from '../stores/createCanvasEditorStore.js';
import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore.js';

const stores = vi.hoisted(() => [] as unknown[]);
vi.mock('../stores/createCanvasEditorStore.js', async (importOriginal) => {
  const original = await importOriginal<typeof StoreModule>();
  return {
    ...original,
    createCanvasEditorStore: (...args: Parameters<typeof original.createCanvasEditorStore>) => {
      const store = original.createCanvasEditorStore(...args);
      stores.push(store);
      return store;
    },
  };
});

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const PAGE_ID = 'seed-0';
const REMOTE = 'client-a';

interface Shape {
  id: string;
  x: number;
  [key: string]: unknown;
}

const shape = (id: string, x: number): Shape => ({
  id,
  type: 'rect',
  x,
  y: 100,
  width: 200,
  height: 200,
  rotation: 0,
  fill: '#005538',
});

const pageState = (doc: Y.Doc): Record<string, unknown> =>
  readPages(doc).find((p) => p.id === PAGE_ID)!.state;

const xOf = (state: Record<string, unknown>, id: string): number | undefined =>
  (state.shapeInstances as Shape[] | undefined)?.find((s) => s.id === id)?.x;

/** Client B: a mounted canvas on `docB`. Client A: a bare Y.Doc kept in sync with it. */
async function mountTwoClients(seed: Record<string, unknown>, hostKeys: string[]) {
  const config = await loadCanvasConfig('fixture-poster');
  const docB = new Y.Doc();
  // A wins a concurrent write to the same key: Y.Map keeps the higher client id.
  docB.clientID = 1;
  seedPagesIfEmpty(docB, [{ id: PAGE_ID, configId: 'fixture-poster', state: seed }]);
  const docA = new Y.Doc();
  docA.clientID = 2;
  Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
  // While `held` is set, updates wait in it: both clients edit without seeing each other.
  let held: (() => void)[] | null = null;
  const deliver = (send: () => void) => (held ? held.push(send) : send());
  docB.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE) deliver(() => Y.applyUpdate(docA, update, 'from-b'));
  });
  docA.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'from-b') deliver(() => Y.applyUpdate(docB, update, REMOTE));
  });
  const disconnect = () => {
    held = [];
  };
  const reconnect = () =>
    act(async () => {
      const queued = held ?? [];
      held = null;
      for (const send of queued) send();
    });

  const page = readPages(docB)[0];
  const hostCallbacks = Object.fromEntries(hostKeys.map((name) => [name, () => {}]));
  const callbacks = createPageSyncedCallbacks(
    () => hostCallbacks,
    (partial) =>
      docB.transact(() => updatePageStateById(docB, PAGE_ID, partial), PAGES_STATE_ORIGIN),
    pagePersistedStateKeys()
  );
  const live: { state: Record<string, unknown>; actions: Record<string, unknown> } = {
    state: {},
    actions: {},
  };
  const ref = createRef<GenericCanvasRef>();
  stores.length = 0;

  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
          config={config as never}
          initialProps={page.state}
          onExport={() => {}}
          onCancel={() => {}}
          callbacks={callbacks}
          autoSave={false}
          onLiveState={(state, actions) => {
            live.state = state;
            live.actions = actions;
          }}
          pageBinding={{ pageYMap: page.yMap, isSynced: true }}
        />
      </AutoSaveStoreProvider>
    );
  });
  const store = stores[stores.length - 1] as CanvasEditorStoreApi;
  await vi.waitFor(() => expect(store.getState().history).toHaveLength(1));

  /** A writes from its own view of the page, as a real client does. */
  const remoteEdit = (edit: (state: Record<string, unknown>) => Record<string, unknown>) =>
    act(async () => {
      docA.transact(() => updatePageStateById(docA, PAGE_ID, edit(pageState(docA))), REMOTE);
    });
  /** B's own edit, committed as its own history entry. */
  const localEdit = async (edit: () => void) => {
    const before = store.getState().historyIndex;
    await act(async () => {
      edit();
    });
    await vi.waitFor(() => expect(store.getState().historyIndex).toBe(before + 1));
  };

  return { docA, docB, ref, live, store, remoteEdit, localEdit, disconnect, reconnect };
}

const undo = (ref: RefObject<GenericCanvasRef | null>) =>
  act(async () => {
    ref.current!.undo!();
  });
const redo = (ref: RefObject<GenericCanvasRef | null>) =>
  act(async () => {
    ref.current!.redo!();
  });

const ids = (state: Record<string, unknown>): string[] =>
  ((state.shapeInstances as Shape[] | undefined) ?? []).map((s) => s.id);

/** The shapes' order in `layerOrder`, which also lists the template's own layers. */
const shapeOrder = (state: Record<string, unknown>): string[] =>
  ((state.layerOrder as string[] | undefined) ?? []).filter((id) => /^s\d$/.test(id));

const moveShape = (state: Record<string, unknown>, id: string, x: number) => ({
  shapeInstances: (state.shapeInstances as Shape[]).map((s) => (s.id === id ? { ...s, x } : s)),
});

describe("undo keeps another client's edits", () => {
  it('B undoes its own move; A’s move of another shape in the same array stays', async () => {
    const { docA, docB, ref, live, remoteEdit, localEdit } = await mountTwoClients(
      { shapeInstances: [shape('s1', 100), shape('s2', 100)] },
      []
    );
    const updateShape = live.actions.updateShape as (id: string, p: Partial<Shape>) => void;

    await localEdit(() => updateShape('s1', { x: 500 }));
    await remoteEdit((state) => moveShape(state, 's2', 900));
    expect(xOf(live.state, 's2')).toBe(900);

    await act(async () => {
      ref.current!.undo!();
    });
    for (const state of [live.state, pageState(docB), pageState(docA)]) {
      expect(xOf(state, 's1')).toBe(100);
      expect(xOf(state, 's2')).toBe(900);
    }

    await act(async () => {
      ref.current!.redo!();
    });
    for (const state of [live.state, pageState(docB), pageState(docA)]) {
      expect(xOf(state, 's1')).toBe(500);
      expect(xOf(state, 's2')).toBe(900);
    }
  }, 90_000);

  it('a later step of B does not take A’s edit along when it is undone', async () => {
    const { docA, ref, live, remoteEdit, localEdit } = await mountTwoClients(
      { shapeInstances: [shape('s1', 100), shape('s2', 100)] },
      []
    );
    const updateShape = live.actions.updateShape as (id: string, p: Partial<Shape>) => void;

    await localEdit(() => updateShape('s1', { x: 500 }));
    await remoteEdit((state) => moveShape(state, 's2', 900));
    // This entry is taken after A's edit and therefore contains it.
    await localEdit(() => updateShape('s1', { x: 600 }));

    await act(async () => {
      ref.current!.undo!();
    });
    await act(async () => {
      ref.current!.undo!();
    });
    expect(xOf(live.state, 's1')).toBe(100);
    expect(xOf(live.state, 's2')).toBe(900);
    expect(xOf(pageState(docA), 's2')).toBe(900);
  }, 90_000);

  it('text fields: B undoes line1, A’s line2 stays', async () => {
    const { docA, ref, live, remoteEdit, localEdit } = await mountTwoClients(
      { line1: 'alt', line2: 'Zwei', line3: 'Drei' },
      ['onLine1Change', 'onLine2Change', 'onLine3Change']
    );

    await localEdit(() => (live.actions.setLine1 as (t: string) => void)('neu'));
    await remoteEdit(() => ({ line2: 'von A' }));
    expect(live.state.line2).toBe('von A');

    await act(async () => {
      ref.current!.undo!();
    });
    expect(live.state.line1).toBe('alt');
    expect(live.state.line2).toBe('von A');
    expect(pageState(docA).line1).toBe('alt');
    expect(pageState(docA).line2).toBe('von A');
  }, 90_000);

  it('a write from a stale view: B loses its own step to A on the key but can redo it', async () => {
    const { docA, docB, ref, live, remoteEdit, localEdit, disconnect, reconnect } =
      await mountTwoClients({ shapeInstances: [shape('s1', 100), shape('s2', 100)] }, []);
    const updateShape = live.actions.updateShape as (id: string, p: Partial<Shape>) => void;

    disconnect();
    await localEdit(() => updateShape('s1', { x: 500 }));
    await remoteEdit((state) => moveShape(state, 's2', 900));
    await reconnect();
    // #176: A's whole-array write wins, B's move is gone from the page.
    expect(xOf(live.state, 's1')).toBe(100);
    expect(xOf(live.state, 's2')).toBe(900);

    // B's step is still in its history: undo is a no-op, redo brings the move back.
    await undo(ref);
    await redo(ref);
    for (const state of [live.state, pageState(docB), pageState(docA)]) {
      expect(xOf(state, 's1')).toBe(500);
      expect(xOf(state, 's2')).toBe(900);
    }
  }, 90_000);

  it('a remote delete survives undo and redo of an own step', async () => {
    const { docA, ref, live, remoteEdit, localEdit } = await mountTwoClients(
      { shapeInstances: [shape('s1', 100), shape('s2', 100)] },
      []
    );
    const updateShape = live.actions.updateShape as (id: string, p: Partial<Shape>) => void;

    await localEdit(() => updateShape('s1', { x: 500 }));
    await remoteEdit((state) => ({
      shapeInstances: (state.shapeInstances as Shape[]).filter((s) => s.id !== 's2'),
    }));
    expect(ids(live.state)).toEqual(['s1']);

    await undo(ref);
    expect(ids(live.state)).toEqual(['s1']);
    expect(xOf(live.state, 's1')).toBe(100);
    await redo(ref);
    for (const state of [live.state, pageState(docA)]) {
      expect(ids(state)).toEqual(['s1']);
      expect(xOf(state, 's1')).toBe(500);
    }
  }, 90_000);

  it('a remote edit made while B is undone survives the redo', async () => {
    const { docA, ref, live, remoteEdit, localEdit } = await mountTwoClients(
      { shapeInstances: [shape('s1', 100), shape('s2', 100)] },
      []
    );
    const updateShape = live.actions.updateShape as (id: string, p: Partial<Shape>) => void;

    await localEdit(() => updateShape('s1', { x: 500 }));
    await undo(ref);
    await remoteEdit((state) => moveShape(state, 's2', 900));
    await redo(ref);
    for (const state of [live.state, pageState(docA)]) {
      expect(xOf(state, 's1')).toBe(500);
      expect(xOf(state, 's2')).toBe(900);
    }
  }, 90_000);

  it('undo of an own add removes the element even after A moved it', async () => {
    const { docA, ref, live, remoteEdit, localEdit } = await mountTwoClients(
      { shapeInstances: [shape('s1', 100)] },
      []
    );

    await localEdit(() => (live.actions.addShape as (type: string) => void)('rect'));
    const added = ids(live.state).find((id) => id !== 's1')!;
    await remoteEdit((state) => moveShape(state, added, 900));

    await undo(ref);
    for (const state of [live.state, pageState(docA)]) expect(ids(state)).toEqual(['s1']);
    await redo(ref);
    // Redo brings the element back with A's move.
    for (const state of [live.state, pageState(docA)]) {
      expect(ids(state)).toEqual(['s1', added]);
      expect(xOf(state, added)).toBe(900);
    }
  }, 90_000);

  it('undo of an own reorder still works after A added a layer', async () => {
    const { docA, ref, live, store, remoteEdit, localEdit } = await mountTwoClients(
      {
        shapeInstances: [shape('s1', 100), shape('s2', 100)],
        layerOrder: ['s1', 's2'],
      },
      []
    );

    await localEdit(() => {
      store.getState().setSelectedElement('s2');
      ref.current!.handleMoveLayer!('down');
    });
    expect(shapeOrder(live.state)).toEqual(['s2', 's1']);
    await remoteEdit((state) => ({
      shapeInstances: [...(state.shapeInstances as Shape[]), shape('s3', 300)],
      layerOrder: [...(state.layerOrder as string[]), 's3'],
    }));
    expect(shapeOrder(live.state)).toEqual(['s2', 's1', 's3']);

    await undo(ref);
    for (const state of [live.state, pageState(docA)]) {
      expect(shapeOrder(state)).toEqual(['s1', 's2', 's3']);
      expect(ids(state)).toEqual(['s1', 's2', 's3']);
    }
    await redo(ref);
    for (const state of [live.state, pageState(docA)]) {
      expect(shapeOrder(state)).toEqual(['s2', 's1', 's3']);
    }
  }, 90_000);
});
