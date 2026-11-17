// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Two writers change the SAME property of one element of a structured collection. That is the
 * one case left where a remote write can overwrite an own write it never saw. The sync hook must
 * report it consistently (`(partial, base, own)`, see `remoteWriteBase.vitest.tsx` for the plain
 * counterpart), and the canvas history that rebases on it must stay consistent on both clients.
 * "Same-leaf concurrent writes through the sync hook" is marked unverified in
 * `docs/design/element-storage.md`.
 */
import { stateKeyClasses, writeStateKeys } from '@ggraphic/core/ydoc';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  PAGE_ID,
  SHAPES,
  agreedValue,
  expectEveryView,
  isStructured,
  linkedDocs,
  mountClient,
  pageState,
  shape,
  stateMapOf,
  updateShape,
  v4Doc,
  xOf,
  type Shape,
} from './__tests__/elementStorageKit.js';
import { PAGES_STATE_ORIGIN } from './useYjsPages.js';
import { useYjsPageStateSync } from './useYjsPageStateSync.js';
import { readPages } from './pagesDoc.js';

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

const OPTIONS = { classes: stateKeyClasses([]), lift: true };
const A = [shape('a', 1), shape('b', 2)];
const withA = (patch: Partial<Shape>) => [{ ...A[0]!, ...patch }, A[1]!];

/** This client (5) with the hook mounted, a lower (1) and a higher (9) client id; all version 4. */
function setup() {
  const me = v4Doc([{ id: PAGE_ID, configId: 'fixture-poster', state: { [SHAPES]: A } }], 5);
  const low = new Y.Doc();
  low.clientID = 1;
  const high = new Y.Doc();
  high.clientID = 9;
  for (const other of [low, high]) Y.applyUpdate(other, Y.encodeStateAsUpdate(me));
  const onRemoteState = vi.fn();
  renderHook(() =>
    useYjsPageStateSync({ pageYMap: readPages(me)[0]!.yMap, isSynced: true, onRemoteState })
  );
  const write = (d: Y.Doc, partial: Record<string, unknown>, origin: unknown = 'user') =>
    d.transact(() => writeStateKeys(stateMapOf(d), partial, OPTIONS), origin);
  const send = (from: Y.Doc, to: Y.Doc) =>
    act(() => {
      Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)), 'remote');
    });
  const calls = () =>
    onRemoteState.mock.calls.map(([partial, base, own]) => ({
      partial: partial as Record<string, unknown>,
      base: base as Record<string, unknown>,
      own: own as boolean,
    }));
  /** The React state of the canvas: its own write applied at once, then every report merged in. */
  const replay = (ownPartial: Record<string, unknown> | null) => {
    let state: Record<string, unknown> = { [SHAPES]: A, ...ownPartial };
    for (const call of calls()) state = { ...state, ...call.partial };
    return state;
  };
  return { me, low, high, write, send, calls, replay };
}

describe('the same property of one element, written by two clients', () => {
  it('after a sequential write the base is the value it replaced', async () => {
    const { me, high, write, send, calls } = setup();
    write(me, { [SHAPES]: withA({ x: 10 }) }, PAGES_STATE_ORIGIN);
    await send(me, high);
    write(high, { [SHAPES]: withA({ x: 20 }) });
    await send(high, me);
    expect(calls()).toEqual([
      { partial: { [SHAPES]: withA({ x: 20 }) }, base: { [SHAPES]: withA({ x: 10 }) }, own: false },
    ]);
  });

  // The design note says the base of a structured key is the hook's cache of the key's last plain
  // value, which already holds the own write. For the plain key `remoteWriteBase.vitest.tsx`
  // pins the opposite (the base skips the own write the remote did not see). Here the note wins:
  // the base keeps the own x = 10 and the remote's x = 99 replaces it. Whether the history then
  // rebases the same way is what the mounted test below checks, from the outside.
  it('a higher client that did not see the own write wins; the base is the cached value, own write included', async () => {
    const { me, high, write, send, calls } = setup();
    write(me, { [SHAPES]: withA({ x: 10 }) }, PAGES_STATE_ORIGIN);
    write(high, { [SHAPES]: withA({ x: 99 }) });
    await send(high, me);
    expect(calls()).toEqual([
      { partial: { [SHAPES]: withA({ x: 99 }) }, base: { [SHAPES]: withA({ x: 10 }) }, own: false },
    ]);
  });

  it('a lower client that did not see the own write loses: nothing changes for the canvas', async () => {
    const { me, low, write, send, replay } = setup();
    write(me, { [SHAPES]: withA({ x: 10 }) }, PAGES_STATE_ORIGIN);
    write(low, { [SHAPES]: withA({ x: 99 }) });
    await send(low, me);
    expect(pageState(me)[SHAPES]).toEqual(withA({ x: 10 }));
    expect(replay({ [SHAPES]: withA({ x: 10 }) })[SHAPES]).toEqual(withA({ x: 10 }));
  });

  it('different properties of the same element merge; the base keeps the own write', async () => {
    const { me, high, write, send, calls } = setup();
    write(me, { [SHAPES]: withA({ x: 10 }) }, PAGES_STATE_ORIGIN);
    write(high, { [SHAPES]: withA({ y: 7 }) });
    await send(high, me);
    expect(calls()).toEqual([
      {
        partial: { [SHAPES]: withA({ x: 10, y: 7 }) },
        base: { [SHAPES]: withA({ x: 10 }) },
        own: false,
      },
    ]);
  });

  it.each([
    ['a higher client', 'high'],
    ['a lower client', 'low'],
  ] as const)(
    'replaying every report onto the canvas state ends at the document (%s)',
    async (_, who) => {
      const setups = setup();
      const other = setups[who];
      setups.write(setups.me, { [SHAPES]: withA({ x: 10 }) }, PAGES_STATE_ORIGIN);
      setups.write(other, { [SHAPES]: withA({ x: 99, y: 7 }) });
      await setups.send(other, setups.me);
      setups.write(other, { [SHAPES]: withA({ x: 98, y: 7 }) });
      await setups.send(other, setups.me);
      expect(setups.replay({ [SHAPES]: withA({ x: 10 }) })[SHAPES]).toEqual(
        pageState(setups.me)[SHAPES]
      );
    }
  );
});

describe('two mounted clients write the same property, then one undoes', () => {
  const latestStore = () => stores[stores.length - 1];

  it('the clients converge, and undo does not take the other client’s winning value away', async () => {
    const { a, b, flush } = linkedDocs((clientID) =>
      v4Doc(
        [
          {
            id: PAGE_ID,
            configId: 'fixture-poster',
            state: { [SHAPES]: [shape('s1', 100), shape('s2', 100)] },
          },
        ],
        clientID
      )
    );
    const clientA = await mountClient(a, { latestStore });
    const clientB = await mountClient(b, { latestStore });
    await flush();
    const both = [clientA, clientB];

    const steps = clientB.store!.getState().historyIndex;
    await updateShape(clientB, 's1', { x: 500 });
    await vi.waitFor(() => expect(clientB.store!.getState().historyIndex).toBe(steps + 1));
    await updateShape(clientA, 's1', { x: 900 });
    await flush();

    const winner = agreedValue(both, (s) => xOf(s, 's1'));
    expect([500, 900]).toContain(winner);

    await act(async () => {
      clientB.ref.current!.undo!();
    });
    await flush();
    // B's step is undone only where B's value is still the live one; A's value stays.
    expectEveryView(both, (s) => xOf(s, 's1'), winner === 900 ? 900 : 100);
    expectEveryView(both, (s) => xOf(s, 's2'), 100);
    expect(Y.encodeStateVector(a)).toEqual(Y.encodeStateVector(b));
    // Both clients wrote through the editor: the collection is a structure, not plain JSON.
    expect(isStructured(a, SHAPES)).toBe(true);
    expect(isStructured(b, SHAPES)).toBe(true);
  }, 90_000);
});
