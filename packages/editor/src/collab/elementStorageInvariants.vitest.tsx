// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Invariants of the version 4 writers and the open-time lift that the other element-storage
 * tests do not pin: undo never reverts a lift and the deck undo restores structured pages, a
 * convert and a deck replacement give the JSON view an unlifted (plain) document gets, the
 * accepted loss when two clients lift at once is bounded to edits made before their lifts meet,
 * and an old writer's plain write over a structure converges and is lifted again.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  PAGE_ID,
  SHAPES,
  agreedValue,
  deckJson,
  isStructured,
  linkedDocs,
  mountClient,
  pageState,
  schemaVersionOf,
  shape,
  stateMapOf,
  updateShape,
  v3Doc,
  v4Doc,
  xOf,
} from './__tests__/elementStorageKit.js';
import {
  readPages,
  replaceDeck,
  serializeDeck,
  setPageConfigById,
  updatePageStateById,
  type ReplaceDeckOps,
} from './pagesDoc.js';
import { PAGES_STATE_ORIGIN, useYjsPages } from './useYjsPages.js';
import { registerStampKind, STAMP_KIND } from '../testing/stampKind.js';

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
const latestStore = () => stores[stores.length - 1];

const STATE = {
  headline: 'Eins',
  [SHAPES]: [shape('s1', 100), shape('s2', 200)],
  layerOrder: ['s1', 's2'],
  lockedLayerIds: ['s2'],
  iconStates: { i1: { color: '#005538' } },
};
const pages = (state: Record<string, unknown> = STATE) => [
  { id: PAGE_ID, configId: 'fixture-poster', state },
  { id: 'p2', configId: 'fixture-poster', state: { [SHAPES]: [shape('z', 5)], headline: 'Zwei' } },
];

/** A writing client's open (`canWrite: true`), which lifts. */
const openDeck = (doc: Y.Doc) => renderHook(() => useYjsPages(doc, true, null, true));

describe('undo after the lift', () => {
  it('the first canvas edit is undoable, and its undo keeps the lift', async () => {
    const doc = v3Doc(pages());
    openDeck(doc);
    expect(isStructured(doc, SHAPES)).toBe(true);
    const client = await mountClient(doc, { latestStore });
    const store = client.store as CanvasEditorStoreApi;
    // The canvas commits its first history entry after mount.
    await vi.waitFor(() => expect(store.getState().history).toHaveLength(1));
    const steps = store.getState().historyIndex;

    await updateShape(client, 's1', { x: 500 });
    await vi.waitFor(() => expect(store.getState().historyIndex).toBe(steps + 1));
    expect(xOf(pageState(doc), 's1')).toBe(500);

    await act(async () => {
      client.ref.current!.undo!();
    });
    expect(xOf(pageState(doc), 's1')).toBe(100);
    expect(xOf(client.live.state, 's1')).toBe(100);
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(schemaVersionOf(doc)).toBe(4);
  }, 90_000);

  it('the first page op is undoable, and its undo keeps the lift', () => {
    const doc = v3Doc(pages());
    const { result } = openDeck(doc);
    expect(result.current!.canUndoPageOp).toBe(false);
    act(() => result.current!.addPage({ id: 'p3', configId: 'fixture-poster', state: STATE }));
    expect(isStructured(doc, SHAPES, 'p3')).toBe(true);
    act(() => result.current!.undoPageOp());
    expect(readPages(doc).map((p) => p.id)).toEqual([PAGE_ID, 'p2']);
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(schemaVersionOf(doc)).toBe(4);
    expect(result.current!.canUndoPageOp).toBe(false);
  });

  it('the deck undo manager does not capture element writes with the state origin', () => {
    const doc = v4Doc(pages());
    const { result } = openDeck(doc);
    act(() =>
      result.current!.updatePageState(PAGE_ID, {
        [SHAPES]: [shape('s1', 999), shape('s2', 200)],
      })
    );
    expect(xOf(pageState(doc), 's1')).toBe(999);
    expect(result.current!.canUndoPageOp).toBe(false);
  });
});

describe('the deck undo of a removed structured page', () => {
  it('brings the page back with its structured contents, and it stays editable', () => {
    const doc = v4Doc(pages());
    const { result } = openDeck(doc);
    const before = deckJson(doc);
    const oldState = stateMapOf(doc);

    act(() => result.current!.removePage(PAGE_ID));
    expect(readPages(doc).map((p) => p.id)).toEqual(['p2']);
    act(() => result.current!.undoPageOp());

    expect(deckJson(doc)).toEqual(before);
    // Yjs restores a deleted map as a new instance, nested structures included.
    const restored = stateMapOf(doc);
    expect(restored).not.toBe(oldState);
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(isStructured(doc, 'layerOrder')).toBe(true);
    const view = result.current!.pages.find((p) => p.id === PAGE_ID)!;
    expect(view.state).toEqual(STATE);

    // An edit of the restored page reaches its new structure, and the read memo sees it.
    act(() =>
      result.current!.updatePageState(PAGE_ID, {
        [SHAPES]: [shape('s1', 321), shape('s2', 200)],
      })
    );
    expect(xOf(pageState(doc), 's1')).toBe(321);
    expect(xOf(result.current!.pages.find((p) => p.id === PAGE_ID)!.state, 's1')).toBe(321);

    // Duplicate and convert of the restored page.
    let copy: string | null = null;
    act(() => {
      copy = result.current!.duplicatePage(PAGE_ID);
    });
    expect(copy).not.toBeNull();
    expect(isStructured(doc, SHAPES, copy!)).toBe(true);
    expect(xOf(pageState(doc, copy!), 's1')).toBe(321);
    act(() =>
      result.current!.setPageConfig(PAGE_ID, 'fixture-poster', { [SHAPES]: [shape('n', 1)] })
    );
    expect(pageState(doc)).toEqual({ [SHAPES]: [shape('n', 1)] });
    expect(xOf(pageState(doc, copy!), 's1')).toBe(321);
  });

  it('a convert and its undo give back the structured state', () => {
    const doc = v4Doc(pages());
    const { result } = openDeck(doc);
    const before = deckJson(doc);
    act(() =>
      result.current!.setPageConfig(PAGE_ID, 'fixture-poster', { [SHAPES]: [shape('n', 1)] })
    );
    act(() => result.current!.undoPageOp());
    expect(deckJson(doc)).toEqual(before);
    expect(isStructured(doc, SHAPES)).toBe(true);
    act(() => result.current!.redoPageOp());
    expect(pageState(doc)).toEqual({ [SHAPES]: [shape('n', 1)] });
  });
});

describe('a convert and a deck replacement give the JSON view of a plain document', () => {
  const OPS: ReplaceDeckOps = {
    updates: [
      {
        pageId: PAGE_ID,
        state: { headline: 'Neu', [SHAPES]: [shape('s2', 7), shape('n1', 8)], layerOrder: ['n1'] },
      },
    ],
    inserts: [
      {
        afterPageId: PAGE_ID,
        configId: 'fixture-poster',
        pageId: 'p3',
        state: { [SHAPES]: [shape('i', 2)], iconStates: {} },
      },
    ],
    removes: ['p2'],
  };
  const CONVERT = { [SHAPES]: [shape('c', 3)], templateTextAligns: { title: 'left' } };

  /** The three documents: never lifted (what an older build wrote), version 4, and lifted on open. */
  const docs = () => {
    const plain = v3Doc(pages());
    const v4 = v4Doc(pages());
    const lifted = v3Doc(pages());
    openDeck(lifted);
    expect(isStructured(plain, SHAPES)).toBe(false);
    expect(isStructured(lifted, SHAPES)).toBe(true);
    return [plain, v4, lifted] as const;
  };

  it('replaceDeck', () => {
    const [plain, ...others] = docs();
    for (const doc of [plain, ...others]) doc.transact(() => replaceDeck(doc, OPS, 'deck'));
    expect(isStructured(plain, SHAPES)).toBe(false);
    for (const doc of others) {
      expect(serializeDeck(doc)).toEqual(serializeDeck(plain));
      expect(isStructured(doc, SHAPES)).toBe(true);
      expect(isStructured(doc, SHAPES, 'p3')).toBe(true);
    }
  });

  it('setPageConfigById', () => {
    const [plain, ...others] = docs();
    for (const doc of [plain, ...others]) {
      doc.transact(() => setPageConfigById(doc, PAGE_ID, 'fixture-poster', CONVERT));
    }
    expect(isStructured(plain, SHAPES)).toBe(false);
    for (const doc of others) {
      expect(serializeDeck(doc)).toEqual(serializeDeck(plain));
      expect(isStructured(doc, 'templateTextAligns')).toBe(true);
    }
  });
});

describe('two clients lift the same version 3 document at once', () => {
  // The deterministic lift identity: both lift the same state into the same structs, so what
  // either writes into its structure before the other's lift arrives lands in the shared one.
  async function race(editor: 'a' | 'b' | 'both') {
    const { a, b, flush } = linkedDocs((clientID) =>
      v3Doc(pages({ [SHAPES]: [shape('s1', 100), shape('s2', 100)] }), clientID)
    );
    openDeck(a);
    openDeck(b);
    // Each has lifted its own copy; neither has the other's lift yet.
    const edit = (doc: Y.Doc, id: string, x: number) =>
      doc.transact(() => {
        const shapes = (pageState(doc)[SHAPES] as { id: string }[]).map((s) =>
          s.id === id ? { ...s, x } : s
        );
        updatePageStateById(doc, PAGE_ID, { [SHAPES]: shapes });
      }, PAGES_STATE_ORIGIN);
    if (editor !== 'b') edit(a, 's1', 500);
    if (editor !== 'a') edit(b, 's2', 600);
    await flush();
    for (const doc of [a, b]) {
      expect(schemaVersionOf(doc)).toBe(4);
      expect(isStructured(doc, SHAPES)).toBe(true);
    }
    expect(serializeDeck(a)).toEqual(serializeDeck(b));
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
    return { a, b, flush };
  }

  it('the higher client’s edit before the lifts met survives', async () => {
    const { a } = await race('a');
    expect(xOf(pageState(a), 's1')).toBe(500);
  });

  it('the lower client’s edit before the lifts met survives too', async () => {
    const { a, b } = await race('b');
    expect(xOf(pageState(a), 's2')).toBe(600);
    expect(pageState(b)[SHAPES]).toEqual([shape('s1', 100), shape('s2', 600)]);
  });

  it('both clients’ edits before the lifts met survive', async () => {
    const { a } = await race('both');
    expect(pageState(a)[SHAPES]).toEqual([shape('s1', 500), shape('s2', 600)]);
  });

  it('the two lifts are one: after the exchange no lift struct exists twice', async () => {
    const { a } = await race('both');
    const derived = Array.from(Y.decodeStateVector(Y.encodeStateVector(a)).keys()).filter(
      (id) => id >= 2 ** 32
    );
    expect(derived).toHaveLength(1);
  });
});

describe('an old writer’s plain value over a structured key', () => {
  it('while this client edits another element: no crash, converges, lifted again', async () => {
    const { a, b, flush } = linkedDocs((clientID) =>
      v4Doc(pages({ [SHAPES]: [shape('s1', 100), shape('s2', 100)] }), clientID)
    );
    const client = await mountClient(a, { latestStore });
    // b plays an old writer: one whole plain array under the structured key.
    b.transact(() => stateMapOf(b).set(SHAPES, [shape('s1', 100), shape('s2', 900)]), 'old-writer');
    await updateShape(client, 's1', { x: 500 });
    await flush();

    // The plain write is the only write to the key's entry (the canvas wrote inside the
    // structure), so it replaces the structure whatever the client ids: its whole value wins
    // and this client's edit of s1 goes with the replaced structure. Version 3's behaviour.
    expect(isStructured(a, SHAPES)).toBe(false);
    expect(agreedValue([client], (s) => s[SHAPES])).toEqual([shape('s1', 100), shape('s2', 900)]);
    expect(pageState(b)[SHAPES]).toEqual([shape('s1', 100), shape('s2', 900)]);
    expect(serializeDeck(a)).toEqual(serializeDeck(b));

    // The next write of the key by this build lifts it again if it is plain.
    await updateShape(client, 's2', { x: 42 });
    await flush();
    expect(isStructured(a, SHAPES)).toBe(true);
    expect(isStructured(b, SHAPES)).toBe(true);
    expect(xOf(pageState(b), 's2')).toBe(42);
    expect(serializeDeck(a)).toEqual(serializeDeck(b));
  }, 90_000);

  it('the old writer wins at key level; the next open lifts it again, nothing else changes', async () => {
    const { a, b, flush } = linkedDocs((clientID) =>
      v4Doc(pages({ [SHAPES]: [shape('s1', 100), shape('s2', 100)] }), clientID)
    );
    a.transact(
      () =>
        updatePageStateById(a, PAGE_ID, {
          [SHAPES]: [shape('s1', 500), shape('s2', 100)],
        }),
      PAGES_STATE_ORIGIN
    );
    b.transact(() => stateMapOf(b).set(SHAPES, [shape('s1', 100), shape('s2', 900)]), 'old-writer');
    await flush();
    // a's edit went into the structure the plain value replaced: lost, as in version 3.
    expect(pageState(a)[SHAPES]).toEqual([shape('s1', 100), shape('s2', 900)]);
    expect(serializeDeck(a)).toEqual(serializeDeck(b));
    const before = deckJson(a);
    openDeck(a);
    await flush();
    expect(isStructured(a, SHAPES)).toBe(true);
    expect(isStructured(b, SHAPES)).toBe(true);
    expect(deckJson(a)).toEqual(before);
    expect(deckJson(b)).toEqual(before);
  });
});

describe('a host element kind', () => {
  it('is lifted on open and written per element, like a core collection', () => {
    registerStampKind();
    const key = STAMP_KIND.stateKey;
    const stamps = [
      { id: 'st1', label: 'A', offset: { x: 1, y: 1 } },
      { id: 'st2', label: 'B', offset: { x: 2, y: 2 } },
    ];
    const doc = v3Doc(pages({ [key]: stamps }));
    openDeck(doc);
    expect(isStructured(doc, key)).toBe(true);
    expect(pageState(doc)[key]).toEqual(stamps);
    doc.transact(
      () => updatePageStateById(doc, PAGE_ID, { [key]: [stamps[0], { ...stamps[1], label: 'C' }] }),
      PAGES_STATE_ORIGIN
    );
    const element = (stateMapOf(doc).get(key) as Y.Map<unknown>).get('st2') as Y.Map<unknown>;
    expect(element.get('label')).toBe('C');
  });
});
