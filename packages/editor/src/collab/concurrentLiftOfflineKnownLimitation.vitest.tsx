// SPDX-License-Identifier: AGPL-3.0-only
/**
 * KNOWN LIMITATION, not a specification: review of #211, finding 2 ("concurrent lifts lose a
 * whole offline session"). The fix is open and waits for a maintainer decision (lift on the
 * server, or a deterministic lift identity); see the review comment on
 * https://github.com/Movm/ggraphic/pull/211.
 *
 * B opens a version 3 document, lifts it, and goes offline before its lift reaches the server;
 * it keeps editing. Later A opens the still-version-3 server document and lifts it too, without
 * editing. When B reconnects, each classed key holds two structures and the one of the higher
 * client id wins at key level (A here). Every element edit B made offline goes with B's losing
 * structure; its edit of a plain key survives. In version 3, B's edits would have survived.
 *
 * This test pins today's outcome so that the fix has a target. A fix turns the two
 * "lost today" assertions red: then flip them to the values B wrote (1004 and 77) and drop this
 * header's "KNOWN LIMITATION".
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { PAGE_ID, SHAPES, pageState, shape, v3Doc, xOf } from './__tests__/elementStorageKit.js';
import { serializeDeck, updatePageStateById } from './pagesDoc.js';
import { PAGES_STATE_ORIGIN, useYjsPages } from './useYjsPages.js';

const pages = () => [
  {
    id: PAGE_ID,
    configId: 'fixture-poster',
    state: { [SHAPES]: [shape('s1', 100), shape('s2', 100)], headline: 'h' },
  },
  { id: 'p2', configId: 'fixture-poster', state: { [SHAPES]: [shape('z', 5)] } },
];

const openWriting = (doc: Y.Doc) => renderHook(() => useYjsPages(doc, true, null, true));

describe('known limitation: concurrent lifts (review of #211, finding 2)', () => {
  it('an offline session loses its element edits to a later opener with a higher client id', () => {
    const server = v3Doc(pages(), 999);
    const b = new Y.Doc();
    b.clientID = 1;
    Y.applyUpdate(b, Y.encodeStateAsUpdate(server));
    openWriting(b); // synced: lifts; then the connection drops before the lift reaches the server
    for (let i = 0; i < 5; i++) {
      b.transact(
        () =>
          updatePageStateById(b, PAGE_ID, {
            [SHAPES]: [shape('s1', 1000 + i), shape('s2', 100)],
          }),
        PAGES_STATE_ORIGIN
      );
    }
    b.transact(
      () => updatePageStateById(b, 'p2', { [SHAPES]: [shape('z', 77)] }),
      PAGES_STATE_ORIGIN
    );
    b.transact(() => updatePageStateById(b, PAGE_ID, { headline: 'from B' }), PAGES_STATE_ORIGIN);
    expect(xOf(pageState(b), 's1')).toBe(1004);

    // Later A opens the server's document (still version 3), lifts, edits nothing.
    const a = new Y.Doc();
    a.clientID = 2;
    Y.applyUpdate(a, Y.encodeStateAsUpdate(server));
    openWriting(a);
    Y.applyUpdate(server, Y.encodeStateAsUpdate(a));

    // B reconnects.
    Y.applyUpdate(server, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(server));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(server));

    // Converged, and whole: the elements read as A's lift, never a mix.
    expect(serializeDeck(b)).toEqual(serializeDeck(server));
    expect(serializeDeck(a)).toEqual(serializeDeck(server));
    expect(pageState(b).headline).toBe('from B');
    // Lost today (the fix makes these red; then expect 1004 and 77):
    expect(xOf(pageState(b), 's1')).toBe(100);
    expect(xOf(pageState(b, 'p2'), 'z')).toBe(5);
  });
});
