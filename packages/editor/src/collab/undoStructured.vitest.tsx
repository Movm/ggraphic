// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `undoKeepsRemoteEdits.vitest.tsx` (#160, #171, #183) with the collection stored the version 4
 * way (Yjs structures per element and property): undo reverts this client's own steps only, and
 * another client's edit that arrived in between survives it, in this canvas and in the shared
 * document. Every case also checks that the collection is still a structure afterwards, so the
 * net is red until the editor writes through the codec (3.C). The case of #176 that the old file
 * pins as a loss is rewritten at the end ("both survive").
 */
import { pagePersistedStateKeys } from './pageElementStateKeys.js';
import { isStructured, stateMapOf, v4Doc } from './__tests__/elementStorageKit.js';
import { readPages, updatePageStateById } from './pagesDoc.js';
import { PAGES_STATE_ORIGIN } from './useYjsPages.js';
import { createPageSyncedCallbacks } from './wrapCallbacksWithPageSync.js';
import { GenericCanvas, type GenericCanvasRef } from '../components/GenericCanvas.js';
import { loadCanvasConfig } from '../configs/configLoader.js';
import '../testing/fixtureTemplates';
import { AutoSaveStoreProvider } from '../stores/AutoSaveStoreProvider.js';

import { act, render } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/** The collection must still be a structure after the test's writes (version 4 writers). */
let structuredDocs: Y.Doc[] = [];
afterEach(() => {
  const docs = structuredDocs;
  structuredDocs = [];
  for (const doc of docs) expect(isStructured(doc, 'shapeInstances')).toBe(true);
});

/** Client B: a mounted canvas on `docB`. Client A: a bare Y.Doc kept in sync with it. */
async function mountTwoClients(seed: Record<string, unknown>, hostKeys: string[]) {
  const config = await loadCanvasConfig('fixture-poster');
  // A wins a concurrent write to the same property: Y.Map keeps the higher client id.
  const docB = v4Doc([{ id: PAGE_ID, configId: 'fixture-poster', state: seed }], 1);
  const docA = new Y.Doc();
  docA.clientID = 2;
  Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
  if ('shapeInstances' in seed) structuredDocs = [docA, docB];
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

  /** Client C: a third Y.Doc as B's peer; its updates reach B only through `sendFromC`. */
  const docC = new Y.Doc();
  docC.clientID = 3;
  Y.applyUpdate(docC, Y.encodeStateAsUpdate(docB));
  const editC = (edit: (state: Record<string, unknown>) => Record<string, unknown>) =>
    docC.transact(() => updatePageStateById(docC, PAGE_ID, edit(pageState(docC))), REMOTE);
  const syncC = () => Y.applyUpdate(docC, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docC)));
  const sendFromC = () =>
    act(async () => {
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docC, Y.encodeStateVector(docB)), REMOTE);
    });

  return {
    docA,
    docB,
    ref,
    live,
    store,
    remoteEdit,
    localEdit,
    disconnect,
    reconnect,
    editC,
    syncC,
    sendFromC,
  };
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

  // Supersedes `undoKeepsRemoteEdits.vitest.tsx` "a write from a stale view: B loses its own step
  // to A on the key but can redo it", whose `expect(xOf(live.state, 's1')).toBe(100)` after the
  // reconnect asserts the #176 loss. In version 4 both moves survive; undo reverts only B's.
  it('a write from a stale view: both moves survive, undo reverts only B’s move, redo brings it back', async () => {
    const { docA, docB, ref, live, remoteEdit, localEdit, disconnect, reconnect } =
      await mountTwoClients({ shapeInstances: [shape('s1', 100), shape('s2', 100)] }, []);
    const updateShape = live.actions.updateShape as (id: string, p: Partial<Shape>) => void;

    disconnect();
    await localEdit(() => updateShape('s1', { x: 500 }));
    await remoteEdit((state) => moveShape(state, 's2', 900));
    await reconnect();
    for (const state of [live.state, pageState(docB), pageState(docA)]) {
      expect(xOf(state, 's1')).toBe(500);
      expect(xOf(state, 's2')).toBe(900);
    }

    await undo(ref);
    for (const state of [live.state, pageState(docB), pageState(docA)]) {
      expect(xOf(state, 's1')).toBe(100);
      expect(xOf(state, 's2')).toBe(900);
    }
    await redo(ref);
    for (const state of [live.state, pageState(docB), pageState(docA)]) {
      expect(xOf(state, 's1')).toBe(500);
      expect(xOf(state, 's2')).toBe(900);
    }
  }, 90_000);

  it('B undoes its move of s1.x; A’s edit of s1.y, a property of the same element, stays', async () => {
    const { docA, docB, ref, live, remoteEdit, localEdit } = await mountTwoClients(
      { shapeInstances: [shape('s1', 100), shape('s2', 100)] },
      []
    );
    const updateShape = live.actions.updateShape as (id: string, p: Partial<Shape>) => void;

    await localEdit(() => updateShape('s1', { x: 500 }));
    await remoteEdit((state) => ({
      shapeInstances: (state.shapeInstances as Shape[]).map((s) =>
        s.id === 's1' ? { ...s, y: 700 } : s
      ),
    }));
    await undo(ref);
    for (const state of [live.state, pageState(docB), pageState(docA)]) {
      expect(xOf(state, 's1')).toBe(100);
      expect((state.shapeInstances as Shape[])[0]!.y).toBe(700);
    }
    await redo(ref);
    for (const state of [live.state, pageState(docB), pageState(docA)]) {
      expect(xOf(state, 's1')).toBe(500);
      expect((state.shapeInstances as Shape[])[0]!.y).toBe(700);
    }
  }, 90_000);

  it('undo of an own delete brings the element back although A edited another element meanwhile', async () => {
    const { docA, ref, live, remoteEdit, localEdit } = await mountTwoClients(
      { shapeInstances: [shape('s1', 100), shape('s2', 100)] },
      []
    );

    await localEdit(() => (live.actions.removeShape as (id: string) => void)('s2'));
    await remoteEdit((state) => moveShape(state, 's1', 900));
    expect(ids(live.state)).toEqual(['s1']);

    await undo(ref);
    for (const state of [live.state, pageState(docA)]) {
      expect(ids(state)).toEqual(['s1', 's2']);
      expect(xOf(state, 's1')).toBe(900);
      expect(xOf(state, 's2')).toBe(100);
    }
    await redo(ref);
    for (const state of [live.state, pageState(docA)]) {
      expect(ids(state)).toEqual(['s1']);
      expect(xOf(state, 's1')).toBe(900);
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

  // Replaces "a third client’s overwrite of A’s edit is not undone by B (separate updates)" of the
  // old file: there C's whole-array write overwrote A's move of s1 (a v3 loss). In version 4 C's
  // edit of s2 is a write to s2 only, so A's move stays, and B's undo and redo touch s1.y only.
  it('a third client’s edit of another element leaves A’s edit and B’s undo alone', async () => {
    const {
      docB,
      ref,
      live,
      remoteEdit,
      localEdit,
      disconnect,
      reconnect,
      editC,
      syncC,
      sendFromC,
    } = await mountTwoClients({ shapeInstances: [shape('s1', 100), shape('s2', 100)] }, []);
    const updateShape = live.actions.updateShape as (id: string, p: Partial<Shape>) => void;
    const yOf = (state: Record<string, unknown>, id: string) =>
      (state.shapeInstances as Shape[]).find((s) => s.id === id)?.y;

    await localEdit(() => updateShape('s1', { y: 300 }));
    syncC();
    disconnect();
    editC((state) => moveShape(state, 's2', 900));
    await remoteEdit((state) => moveShape(state, 's1', 500));
    await reconnect();
    expect(xOf(live.state, 's1')).toBe(500);
    await sendFromC();
    expect(xOf(live.state, 's1')).toBe(500);
    expect(xOf(live.state, 's2')).toBe(900);

    await undo(ref);
    expect(yOf(live.state, 's1')).toBe(100);
    await redo(ref);
    for (const state of [live.state, pageState(docB)]) {
      expect(yOf(state, 's1')).toBe(300);
      expect(xOf(state, 's1')).toBe(500);
      expect(xOf(state, 's2')).toBe(900);
    }
  }, 90_000);
});

describe('own writes from another stack', () => {
  // A deck op and its undo by the page-level Y.UndoManager write the page
  // state with their own origin. Undoing the deck op must not take this
  // client's older step along (the step before a "Vorlage für alle Folien").
  it('an own deck op and its undo leave the older own step undoable', async () => {
    const { docB, ref, live, localEdit } = await mountTwoClients(
      { shapeInstances: [shape('s1', 100), shape('s2', 100)] },
      []
    );
    const updateShape = live.actions.updateShape as (id: string, p: Partial<Shape>) => void;
    const DECK = Symbol('deck-op');
    const deckWrite = (x: number) =>
      act(async () => {
        docB.transact(
          () => updatePageStateById(docB, PAGE_ID, moveShape(pageState(docB), 's1', x)),
          DECK
        );
      });

    await localEdit(() => updateShape('s1', { x: 500 }));
    await deckWrite(700);
    expect(xOf(live.state, 's1')).toBe(700);
    // The deck undo restores the value the deck op replaced.
    await deckWrite(500);
    expect(xOf(live.state, 's1')).toBe(500);

    await undo(ref);
    for (const state of [live.state, pageState(docB)]) expect(xOf(state, 's1')).toBe(100);
  }, 90_000);
});

const rawOrder = (doc: Y.Doc, key = 'layerOrder'): Record<string, string> => {
  const map = stateMapOf(doc, PAGE_ID).get(key);
  return map instanceof Y.Map ? (map.toJSON() as Record<string, string>) : {};
};

describe('delete and undo keep the stored structures tidy (#214)', () => {
  const seed = () => ({
    shapeInstances: [shape('s1', 100), shape('s2', 100), shape('s3', 100)],
    layerOrder: ['s1', 's2', 's3'],
  });

  it('deleting an element removes its id from the structured layerOrder', async () => {
    const { docA, docB, live, localEdit } = await mountTwoClients(seed(), []);
    await localEdit(() => (live.actions.removeShape as (id: string) => void)('s2'));
    for (const doc of [docB, docA]) {
      expect(Object.keys(rawOrder(doc)).filter((k) => k !== '$kind')).toEqual(['s1', 's3']);
    }
  }, 90_000);

  it('undo of a delete puts the id back into layerOrder, between its old neighbours', async () => {
    const { docA, ref, live, localEdit } = await mountTwoClients(seed(), []);
    await localEdit(() => (live.actions.removeShape as (id: string) => void)('s2'));
    await undo(ref);
    expect(shapeOrder(pageState(docA))).toEqual(['s1', 's2', 's3']);
    expect(ids(pageState(docA))).toEqual(['s1', 's2', 's3']);
  }, 90_000);

  it('the first undo of a session creates no empty collection for a key the page never had', async () => {
    const { docA, docB, ref, live, localEdit } = await mountTwoClients(seed(), []);
    const keysOf = (doc: Y.Doc) => [...stateMapOf(doc, PAGE_ID).keys()].sort();
    const before = keysOf(docB);
    await localEdit(() => (live.actions.removeShape as (id: string) => void)('s2'));
    await undo(ref);
    expect(keysOf(docB)).toEqual(before);
    expect(keysOf(docA)).toEqual(before);
  }, 90_000);
});
