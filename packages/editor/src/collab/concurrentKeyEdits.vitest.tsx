// SPDX-License-Identifier: AGPL-3.0-only
/**
 * #176: two clients edit one page at the same time, before either has the other's update. In
 * version 3 every element collection was one JSON value per key, so one client's whole array
 * replaced the other's and its edit was lost. From version 4 the collections are Yjs structures
 * that merge per element, per property and per id (`packages/schema/DOCUMENT_VERSIONING.md`,
 * "Version 4", "Concurrency"). Two real mounted `GenericCanvas` clients on two Y.Docs with a
 * delivery queue between them; every case checks both Y.Docs AND both canvases after delivery.
 * Adopted from the reproduction on `origin/repro/concurrent-key-lww`.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  PAGE_ID,
  SHAPES,
  agreedValue,
  expectEveryView,
  idsOf,
  isStructured,
  linkedDocs,
  mountClient,
  pageState,
  shape,
  shapeOrder,
  shapesOf,
  updateShape,
  v3Doc,
  v4Doc,
  xOf,
  yOf,
  type LiveClient,
} from './__tests__/elementStorageKit.js';
import { useYjsPages } from './useYjsPages.js';

import type * as StoreModule from '../stores/createCanvasEditorStore.js';

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

const page = (state: Record<string, unknown>) => [
  { id: PAGE_ID, configId: 'fixture-poster', state },
];

async function twoClients(state: Record<string, unknown>) {
  const { a, b, flush } = linkedDocs((clientID) => v4Doc(page(state), clientID));
  const clientA = await mountClient(a, { latestStore });
  const clientB = await mountClient(b, { latestStore });
  await flush();
  return { a, b, flush, clientA, clientB, both: [clientA, clientB] as LiveClient[] };
}

const select = (client: LiveClient, id: string) =>
  act(async () => {
    client.store!.getState().setSelectedElement(id);
  });
const moveLayer = (client: LiveClient, direction: 'up' | 'down') =>
  act(async () => {
    client.ref.current!.handleMoveLayer!(direction);
  });
const toggleLock = (client: LiveClient) =>
  act(async () => {
    client.ref.current!.runCommand!('toggleLock', null);
  });

describe('concurrent edits of one collection (#176)', () => {
  it('different elements: both moves survive', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100)],
    });
    expect(isStructured(clientA.doc, SHAPES)).toBe(true);

    // Within one network round trip: neither client has the other's update yet.
    await updateShape(clientA, 's1', { x: 500 });
    await updateShape(clientB, 's2', { x: 900 });
    await flush();

    expectEveryView(both, (s) => [xOf(s, 's1'), xOf(s, 's2')], [500, 900]);
    expect(isStructured(clientA.doc, SHAPES)).toBe(true);
    expect(isStructured(clientB.doc, SHAPES)).toBe(true);
  }, 90_000);

  it('different properties of one element: both survive', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100)],
    });

    await updateShape(clientA, 's1', { x: 500 });
    await updateShape(clientB, 's1', { y: 700 });
    await flush();

    expectEveryView(both, (s) => [xOf(s, 's1'), yOf(s, 's1')], [500, 700]);
    expectEveryView(both, (s) => idsOf(s), ['s1', 's2']);
  }, 90_000);

  it('the same property: last writer wins and both clients converge', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100)],
    });

    await updateShape(clientA, 's1', { x: 500 });
    await updateShape(clientB, 's1', { x: 900 });
    await flush();

    const winner = agreedValue(both, (s) => xOf(s, 's1'));
    expect([500, 900]).toContain(winner);
    // The other element and the element list are untouched.
    expectEveryView(both, (s) => [xOf(s, 's2'), idsOf(s)], [100, ['s1', 's2']]);
    expect(isStructured(clientA.doc, SHAPES)).toBe(true);
    expect(isStructured(clientB.doc, SHAPES)).toBe(true);
  }, 90_000);

  it('delete versus edit of one element: the delete wins and both converge', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100)],
    });

    await act(async () => {
      (clientA.live.actions.removeShape as (id: string) => void)('s2');
    });
    await updateShape(clientB, 's2', { x: 900 });
    await updateShape(clientB, 's1', { x: 400 });
    await flush();

    // No half element: the edit that landed in the removed element is gone with it.
    expectEveryView(both, (s) => idsOf(s), ['s1']);
    expectEveryView(both, (s) => xOf(s, 's1'), 400);
    expect(shapesOf(pageState(clientA.doc))).toEqual(shapesOf(pageState(clientB.doc)));
  }, 90_000);

  it('reorder of one layer at the same time: no duplicate, one position, both converge', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100), shape('s3', 100)],
      layerOrder: ['s1', 's2', 's3'],
    });
    await select(clientA, 's2');
    await select(clientB, 's2');

    await moveLayer(clientA, 'up');
    await moveLayer(clientB, 'down');
    await flush();

    const order = agreedValue(both, (s) => shapeOrder(s));
    expect([...order].sort()).toEqual(['s1', 's2', 's3']);
    expect(new Set(order).size).toBe(order.length);
    expectEveryView(both, (s) => idsOf(s), ['s1', 's2', 's3']);
    expect(isStructured(clientA.doc, 'layerOrder')).toBe(true);
  }, 90_000);

  it('moving different layers at the same time: both moves apply', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100), shape('s3', 100), shape('s4', 100)],
      layerOrder: ['s1', 's2', 's3', 's4'],
    });
    await select(clientA, 's1');
    await select(clientB, 's4');

    await moveLayer(clientA, 'up');
    await moveLayer(clientB, 'down');
    await flush();

    // s1 passed s2 and s4 passed s3: one order, both moves in it.
    expectEveryView(both, (s) => shapeOrder(s), ['s2', 's1', 's4', 's3']);
  }, 90_000);

  it('lock and unlock of different layers at the same time: both apply', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100)],
      layerOrder: ['s1', 's2'],
      lockedLayerIds: ['s2'],
    });
    await select(clientA, 's1');
    await select(clientB, 's2');

    await toggleLock(clientA); // locks s1
    await toggleLock(clientB); // unlocks s2
    await flush();

    expectEveryView(both, (s) => s.lockedLayerIds, ['s1']);
    expect(isStructured(clientA.doc, 'lockedLayerIds')).toBe(true);
  }, 90_000);

  it('both clients lock the same layer: it is in the list once', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100)],
      layerOrder: ['s1', 's2'],
      lockedLayerIds: [],
    });
    await select(clientA, 's1');
    await select(clientB, 's1');

    await toggleLock(clientA);
    await toggleLock(clientB);
    await flush();

    expectEveryView(both, (s) => s.lockedLayerIds, ['s1']);
    expect(isStructured(clientA.doc, 'lockedLayerIds')).toBe(true);
  }, 90_000);

  it('each client adds an element to the same collection: both are added, in one order', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100)],
    });

    await act(async () => {
      (clientA.live.actions.addShape as (type: string) => void)('rect');
    });
    await act(async () => {
      (clientB.live.actions.addShape as (type: string) => void)('rect');
    });
    await flush();

    const ids = agreedValue(both, (s) => idsOf(s));
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids.slice(0, 2)).toEqual(['s1', 's2']);
  }, 90_000);
});

describe('a client that was offline', () => {
  it('three edits on one side against one on the other, all on different elements: all four survive', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100), shape('s3', 100), shape('s4', 100)],
    });

    // A is offline: its updates wait in the queue. B makes one edit meanwhile.
    await updateShape(clientA, 's1', { x: 300 });
    await updateShape(clientA, 's2', { x: 400 });
    await updateShape(clientA, 's3', { x: 700 });
    await updateShape(clientB, 's4', { x: 900 });
    await flush();

    expectEveryView(both, (s) => [1, 2, 3, 4].map((n) => xOf(s, `s${n}`)), [300, 400, 700, 900]);
  }, 90_000);

  it('two edits to one element and one to another while the other side edits a third', async () => {
    const { flush, clientA, clientB, both } = await twoClients({
      [SHAPES]: [shape('s1', 100), shape('s2', 100), shape('s3', 100)],
    });

    await updateShape(clientA, 's1', { x: 300 });
    await updateShape(clientA, 's1', { x: 400 });
    await updateShape(clientA, 's3', { x: 700 });
    await updateShape(clientB, 's2', { x: 900 });
    await flush();

    expectEveryView(both, (s) => [1, 2, 3].map((n) => xOf(s, `s${n}`)), [400, 900, 700]);
  }, 90_000);
});

describe('the same concurrency from a version 3 document opened through the page hook', () => {
  it('both clients lift on open and then keep each other’s edits', async () => {
    const { a, b, flush } = linkedDocs((clientID) =>
      v3Doc(page({ [SHAPES]: [shape('s1', 100), shape('s2', 100)] }), clientID)
    );
    // Each client opens its copy of the document: the lift runs here, on both, at once.
    renderHook(() => useYjsPages(a, true));
    renderHook(() => useYjsPages(b, true));
    await flush();
    expect(isStructured(a, SHAPES)).toBe(true);
    expect(isStructured(b, SHAPES)).toBe(true);

    const clientA = await mountClient(a, { latestStore });
    const clientB = await mountClient(b, { latestStore });
    await flush();
    await updateShape(clientA, 's1', { x: 500 });
    await updateShape(clientB, 's2', { x: 900 });
    await flush();

    expectEveryView([clientA, clientB], (s) => [xOf(s, 's1'), xOf(s, 's2')], [500, 900]);
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
  }, 90_000);
});
