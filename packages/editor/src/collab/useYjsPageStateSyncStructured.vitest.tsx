// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `useYjsPageStateSync` over a page state stored the version 4 way (structures per key): the
 * canvas still gets whole keys in today's plain shape, with the `base` the writer started from.
 * Nothing in the editor writes structures yet, so the tests build them with the codec.
 */
import { liftStateMap, stateKeyClasses, writeStateKeys } from '@ggraphic/core/ydoc';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { readPages, seedPagesIfEmpty } from './pagesDoc.js';
import { PAGES_STATE_ORIGIN } from './useYjsPages.js';
import { useYjsPageStateSync } from './useYjsPageStateSync.js';
import { YDOC_KEYS } from './ydocKeys.js';

const PAGE = 'seed-0';
const SHAPES = 'shapeInstances';
const OPTIONS = { classes: stateKeyClasses([]), lift: true };
const shape = (id: string, x: number) => ({ id, x, y: 0 });
const A = [shape('a', 1), shape('b', 2)];

const doc = (clientID: number) => {
  const d = new Y.Doc();
  d.clientID = clientID;
  return d;
};
const stateOf = (d: Y.Doc) => readPages(d)[0]!.yMap.get(YDOC_KEYS.state) as Y.Map<unknown>;

/** This client (5), a lower (1) and a higher (9) one, all on a stamped version 4 document. */
function setup(options: { lifted: boolean } = { lifted: true }) {
  const me = doc(5);
  seedPagesIfEmpty(me, [
    { id: PAGE, configId: 'fixture-poster', state: { headline: 'h0', [SHAPES]: A } },
  ]);
  if (options.lifted) {
    me.getMap(YDOC_KEYS.meta).set(YDOC_KEYS.schemaVersion, 4);
    liftStateMap(stateOf(me), OPTIONS.classes);
  }
  const low = doc(1);
  const high = doc(9);
  for (const other of [low, high]) Y.applyUpdate(other, Y.encodeStateAsUpdate(me));
  const onRemoteState = vi.fn();
  renderHook(() =>
    useYjsPageStateSync({ pageYMap: readPages(me)[0]!.yMap, isSynced: true, onRemoteState })
  );
  const write = (d: Y.Doc, partial: Record<string, unknown>, origin: unknown = 'user') =>
    d.transact(() => writeStateKeys(stateOf(d), partial, OPTIONS), origin);
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
  return { me, low, high, write, send, calls, onRemoteState };
}

describe('a structured key reaches the canvas as plain JSON', () => {
  it('stores the key as a structure here', () => {
    const { me } = setup();
    expect(stateOf(me).get(SHAPES)).toBeInstanceOf(Y.Map);
  });

  it('reports the whole key for a change to one element, with the plain value as base', () => {
    const { me, high, write, send, calls } = setup();
    write(high, { [SHAPES]: [shape('a', 1), shape('b', 7)] });
    send(high, me);
    expect(calls()).toEqual([
      {
        partial: { [SHAPES]: [shape('a', 1), shape('b', 7)] },
        base: { [SHAPES]: A },
        own: false,
      },
    ]);
    expect(calls()[0]!.partial[SHAPES]).not.toBeInstanceOf(Y.Map);
  });

  it('reports an added element, a removed one, and a move', () => {
    const { me, high, write, send, calls } = setup();
    write(high, { [SHAPES]: [...A, shape('c', 3)] });
    send(high, me);
    write(high, { [SHAPES]: [shape('c', 3), shape('a', 1)] });
    send(high, me);
    expect(calls().map((c) => [c.partial[SHAPES], c.base[SHAPES]])).toEqual([
      [[...A, shape('c', 3)], A],
      [
        [shape('c', 3), shape('a', 1)],
        [...A, shape('c', 3)],
      ],
    ]);
  });

  it('reports one call for a transaction that changes a structured and a plain key', () => {
    const { me, high, write, send, calls } = setup();
    write(high, { [SHAPES]: [shape('a', 5), shape('b', 2)], headline: 'h1' });
    send(high, me);
    expect(calls()).toHaveLength(1);
    expect(calls()[0]).toMatchObject({
      partial: { [SHAPES]: [shape('a', 5), shape('b', 2)], headline: 'h1' },
      base: { [SHAPES]: A, headline: 'h0' },
    });
  });

  it("does not report this client's own write, but the next remote base includes it", () => {
    const { me, high, write, send, calls } = setup();
    write(me, { [SHAPES]: [shape('a', 10), shape('b', 2)] }, PAGES_STATE_ORIGIN);
    expect(calls()).toEqual([]);
    write(high, { [SHAPES]: [shape('a', 1), shape('b', 8)] });
    send(high, me);
    // `high` had not seen the own move of `a`: that move survives the merge and is no part of
    // the remote edit, so it is in the base.
    expect(calls()).toEqual([
      {
        partial: { [SHAPES]: [shape('a', 10), shape('b', 8)] },
        base: { [SHAPES]: [shape('a', 10), shape('b', 2)] },
        own: false,
      },
    ]);
  });

  it('reports an own write with another origin as own', () => {
    const { me, write, calls } = setup();
    write(me, { [SHAPES]: [shape('a', 1)] }, 'deck-op');
    expect(calls()).toEqual([
      { partial: { [SHAPES]: [shape('a', 1)] }, base: { [SHAPES]: A }, own: true },
    ]);
  });

  it('reports a key that becomes absent as undefined', () => {
    const { me, high, send, calls } = setup();
    high.transact(() => stateOf(high).delete(SHAPES), 'user');
    send(high, me);
    expect(calls()).toHaveLength(1);
    expect(Object.hasOwn(calls()[0]!.partial, SHAPES)).toBe(true);
    expect(calls()[0]!.partial[SHAPES]).toBeUndefined();
    expect(calls()[0]!.base[SHAPES]).toEqual(A);
  });

  it('does not report a lift, which leaves the plain value equal', () => {
    const { me, high, send, calls } = setup({ lifted: false });
    high.getMap(YDOC_KEYS.meta).set(YDOC_KEYS.schemaVersion, 4);
    high.transact(() => liftStateMap(stateOf(high), OPTIONS.classes), 'lift');
    send(high, me);
    expect(stateOf(me).get(SHAPES)).toBeInstanceOf(Y.Map);
    expect(calls()).toEqual([]);
  });

  it('keeps the plain base for the first structured edit after a lift', () => {
    const { me, high, write, send, calls } = setup({ lifted: false });
    high.getMap(YDOC_KEYS.meta).set(YDOC_KEYS.schemaVersion, 4);
    high.transact(() => liftStateMap(stateOf(high), OPTIONS.classes), 'lift');
    send(high, me);
    write(high, { [SHAPES]: [shape('a', 4), shape('b', 2)] });
    send(high, me);
    expect(calls()).toEqual([
      {
        partial: { [SHAPES]: [shape('a', 4), shape('b', 2)] },
        base: { [SHAPES]: A },
        own: false,
      },
    ]);
  });
});

describe('plain keys on a document that also holds structures', () => {
  it('report the replaced value as base, as before', () => {
    const { me, high, write, send, calls } = setup();
    write(high, { headline: 'h1' });
    send(high, me);
    expect(calls()).toEqual([
      { partial: { headline: 'h1' }, base: { headline: 'h0' }, own: false },
    ]);
  });

  it("skip this client's own PAGES_STATE_ORIGIN writes", () => {
    const { me, write, calls } = setup();
    write(me, { headline: 'mine' }, PAGES_STATE_ORIGIN);
    expect(calls()).toEqual([]);
  });

  it('use what the own run replaced as base over an own write the writer had not seen', () => {
    const { me, high, write, send, calls } = setup();
    write(me, { headline: 'mine' }, PAGES_STATE_ORIGIN);
    write(high, { headline: 'theirs' });
    send(high, me);
    expect(calls()).toEqual([
      { partial: { headline: 'theirs' }, base: { headline: 'h0' }, own: false },
    ]);
  });
});
