// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `useYjsPageStateSync` reports, next to each remote value, the value its
 * writer started from (`base`) as far as this client's history is concerned:
 * the value the write replaced here — except when it replaced this client's
 * own write without having seen it (#176), where the own write is no part of
 * the remote edit.
 */
import { readPages, seedPagesIfEmpty, updatePageStateById } from './pagesDoc.js';
import { PAGES_STATE_ORIGIN } from './useYjsPages.js';
import { useYjsPageStateSync } from './useYjsPageStateSync.js';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

const PAGE = 'seed-0';
const KEY = 'shapeInstances';

const doc = (clientID: number) => {
  const d = new Y.Doc();
  d.clientID = clientID;
  return d;
};

/** This client (5) with the hook mounted, a lower (1) and a higher (9) client id. */
function setup() {
  const me = doc(5);
  seedPagesIfEmpty(me, [{ id: PAGE, configId: 'fixture-poster', state: { [KEY]: 'v0' } }]);
  const low = doc(1);
  const high = doc(9);
  for (const other of [low, high]) Y.applyUpdate(other, Y.encodeStateAsUpdate(me));
  const onRemoteState = vi.fn();
  renderHook(() =>
    useYjsPageStateSync({ pageYMap: readPages(me)[0].yMap, isSynced: true, onRemoteState })
  );
  const write = (d: Y.Doc, value: unknown, origin: unknown = 'user') =>
    d.transact(() => updatePageStateById(d, PAGE, { [KEY]: value }), origin);
  const remove = (d: Y.Doc) =>
    d.transact(() => {
      const stateY = readPages(d)[0].yMap.get('state') as Y.Map<unknown>;
      stateY.delete(KEY);
    }, 'user');
  /** Everything `to` has not seen from `from`, as one update. */
  const send = (from: Y.Doc, to: Y.Doc) =>
    act(() => {
      Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)), 'remote');
    });
  const reports = () =>
    onRemoteState.mock.calls.map(([partial, base]) => ({
      value: (partial as Record<string, unknown>)[KEY],
      base: (base as Record<string, unknown>)[KEY],
    }));
  return { me, low, high, write, remove, send, reports };
}

describe('the base of a remote write', () => {
  it('is the replaced value after a sequential write', async () => {
    const { me, high, write, send, reports } = setup();
    write(me, 'mine', PAGES_STATE_ORIGIN);
    await send(me, high);
    write(high, 'theirs');
    await send(high, me);
    expect(reports()).toEqual([{ value: 'theirs', base: 'mine' }]);
  });

  it('skips this client’s own write the remote did not see', async () => {
    const { me, high, write, send, reports } = setup();
    write(me, 'mine', PAGES_STATE_ORIGIN);
    write(high, 'theirs');
    await send(high, me);
    expect(reports()).toEqual([{ value: 'theirs', base: 'v0' }]);
  });

  it('skips the own writes the remote did not see, back to the last one it saw', async () => {
    const { me, high, write, send, reports } = setup();
    write(me, 'mine-1', PAGES_STATE_ORIGIN);
    await send(me, high);
    write(me, 'mine-2', PAGES_STATE_ORIGIN);
    write(high, 'theirs');
    await send(high, me);
    expect(reports()).toEqual([{ value: 'theirs', base: 'mine-1' }]);
  });

  it('skips an own write the remote overwrote twice in one batch (reconnect)', async () => {
    const { me, high, write, send, reports } = setup();
    write(me, 'mine', PAGES_STATE_ORIGIN);
    write(high, 'theirs-1');
    write(high, 'theirs-2');
    await send(high, me);
    expect(reports()).toEqual([{ value: 'theirs-2', base: 'v0' }]);
  });

  it('is the replaced value when a third client’s write is overwritten', async () => {
    const { me, low, high, write, send, reports } = setup();
    write(low, 'b');
    write(high, 'c');
    await send(low, me);
    await send(high, me);
    // `b` is in this client's history now; `c` undid it, and that is part of the remote edit.
    expect(reports()).toEqual([
      { value: 'b', base: 'v0' },
      { value: 'c', base: 'b' },
    ]);
  });

  it('is absent for a set after a delete', async () => {
    const { me, high, write, remove, send, reports } = setup();
    remove(high);
    await send(high, me);
    write(high, 'again');
    await send(high, me);
    expect(reports()).toEqual([
      { value: undefined, base: 'v0' },
      { value: 'again', base: undefined },
    ]);
  });

  it('is the replaced value for this client’s own writes outside the canvas', async () => {
    // A deck op, a deck undo's restore or a version lift: owned by another
    // stack or not undoable at all, so the canvas history takes them in.
    const { me, write, reports } = setup();
    write(me, 'deck', 'deck-op');
    expect(reports()).toEqual([{ value: 'deck', base: 'v0' }]);
  });
});
