// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Two or more clients lift the same version 3 document, one of them offline: their lifts are
 * the same Yjs structs (the deterministic lift identity, `DOCUMENT_VERSIONING.md`, "Version 4",
 * "Lift and re-lift"), so Yjs keeps one copy and every client's element edits land in it.
 *
 * This was review finding 2 on #211: before the deterministic identity, each client lifted under
 * its own id, the structure of the higher client id won at key level, and every element edit
 * the other client had made offline went with the losing structure.
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
    state: { [SHAPES]: [shape('s1', 100), shape('s2', 100), shape('s3', 100)], headline: 'h' },
  },
  { id: 'p2', configId: 'fixture-poster', state: { [SHAPES]: [shape('z', 5)] } },
];

const openWriting = (doc: Y.Doc) => renderHook(() => useYjsPages(doc, true, null, true));

/** A client that synced the server's state once and then works offline. */
function client(server: Y.Doc, clientID: number) {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(server));
  openWriting(doc); // synced: lifts; then the connection drops before the lift is sent
  return doc;
}

/** Edit one shape's x on one page, from the client's own view, as the canvas emits it. */
function moveShape(doc: Y.Doc, pageId: string, id: string, x: number) {
  const shapes = (pageState(doc, pageId)[SHAPES] as { id: string }[]).map((s) =>
    s.id === id ? { ...s, x } : s
  );
  doc.transact(() => updatePageStateById(doc, pageId, { [SHAPES]: shapes }), PAGES_STATE_ORIGIN);
}

/** Every client sends everything to the server, then gets everything back. */
function reconnect(server: Y.Doc, ...clients: Y.Doc[]) {
  for (const c of clients) Y.applyUpdate(server, Y.encodeStateAsUpdate(c));
  for (const c of clients) Y.applyUpdate(c, Y.encodeStateAsUpdate(server));
  for (const c of clients) expect(serializeDeck(c)).toEqual(serializeDeck(server));
}

describe('clients that lifted the same version 3 document, one or more offline', () => {
  it('an offline session keeps its element edits against a later opener with a higher client id', () => {
    const server = v3Doc(pages(), 999);
    const b = client(server, 1);
    for (let i = 0; i < 5; i++) moveShape(b, PAGE_ID, 's1', 1000 + i);
    moveShape(b, 'p2', 'z', 77);
    b.transact(() => updatePageStateById(b, PAGE_ID, { headline: 'from B' }), PAGES_STATE_ORIGIN);

    // Later A opens the server's document (still version 3), lifts, edits nothing.
    const a = new Y.Doc();
    a.clientID = 2;
    Y.applyUpdate(a, Y.encodeStateAsUpdate(server));
    openWriting(a);
    Y.applyUpdate(server, Y.encodeStateAsUpdate(a));

    reconnect(server, b, a);
    expect(pageState(b).headline).toBe('from B');
    expect(xOf(pageState(b), 's1')).toBe(1004);
    expect(xOf(pageState(b, 'p2'), 'z')).toBe(77);
  });

  it('both sides edit different elements offline: all edits survive', () => {
    const server = v3Doc(pages(), 999);
    const a = client(server, 2);
    const b = client(server, 1);
    moveShape(a, PAGE_ID, 's1', 501);
    moveShape(a, 'p2', 'z', 502);
    moveShape(b, PAGE_ID, 's2', 601);
    moveShape(b, PAGE_ID, 's3', 602);
    reconnect(server, a, b);
    for (const doc of [a, b]) {
      expect([1, 2, 3].map((n) => xOf(pageState(doc), `s${n}`))).toEqual([501, 601, 602]);
      expect(xOf(pageState(doc, 'p2'), 'z')).toBe(502);
    }
  });

  it('three clients, each offline with its own edits: all edits survive', () => {
    const server = v3Doc(pages(), 999);
    const [a, b, c] = [client(server, 3), client(server, 1), client(server, 2)];
    moveShape(a, PAGE_ID, 's1', 11);
    moveShape(b, PAGE_ID, 's2', 22);
    moveShape(c, PAGE_ID, 's3', 33);
    moveShape(c, 'p2', 'z', 44);
    reconnect(server, c, a, b);
    for (const doc of [a, b, c, server]) {
      expect([1, 2, 3].map((n) => xOf(pageState(doc), `s${n}`))).toEqual([11, 22, 33]);
      expect(xOf(pageState(doc, 'p2'), 'z')).toBe(44);
    }
  });

  it('remaining case: two clients that start from different states still race at key level', () => {
    // A's state has an edit B never saw (an old build's plain write to the server after B
    // synced). Their lifts get different ids and meet at key level, as every lift did before:
    // all clients converge, and the losing side's element edits made before the lifts met are
    // lost. Here B (lower derived id or not) is checked for convergence only.
    const server = v3Doc(pages(), 999);
    const b = client(server, 1);
    moveShape(b, PAGE_ID, 's1', 700);
    server.transact(() => {
      const stateY = server.getMap('pagesById').get(PAGE_ID) as Y.Map<unknown>;
      (stateY.get('state') as Y.Map<unknown>).set('headline', 'old build');
    });
    const a = client(server, 2);
    moveShape(a, PAGE_ID, 's2', 800);
    reconnect(server, a, b);
    const survived = [xOf(pageState(a), 's1') === 700, xOf(pageState(a), 's2') === 800];
    // Exactly one side's structure won: one of the two edits survived, never a mix of halves.
    expect(survived.filter(Boolean)).toHaveLength(1);
    expect(pageState(a).headline).toBe('old build');
  });

  it('remaining case: a transport without causal order can start two lifts from different states', () => {
    // Peer to peer, not through a relay: B opens after it received A's lift (B lifts nothing)
    // and edits a plain key; C gets B's edit before A's lift, which that edit does not depend on.
    // C's state then differs from A's at open, and C's lift meets A's at key level.
    const server = v3Doc(pages(), 999);
    const a = client(server, 1);
    const fromA = Y.encodeStateAsUpdate(a, Y.encodeStateVector(server));
    const b = new Y.Doc();
    b.clientID = 2;
    Y.applyUpdate(b, Y.encodeStateAsUpdate(server));
    Y.applyUpdate(b, fromA);
    openWriting(b);
    // B's update event (only its own transaction's structs and deletions), as a peer sends it.
    let fromB: Uint8Array | null = null;
    b.once('update', (u: Uint8Array) => (fromB = u));
    b.transact(() => updatePageStateById(b, PAGE_ID, { headline: 'from B' }), PAGES_STATE_ORIGIN);
    const c = new Y.Doc();
    c.clientID = 3;
    Y.applyUpdate(c, Y.encodeStateAsUpdate(server));
    Y.applyUpdate(c, fromB!); // B's edit, before A's lift
    openWriting(c);
    moveShape(a, PAGE_ID, 's1', 11);
    moveShape(c, PAGE_ID, 's2', 33);
    reconnect(server, a, b, c);
    const derived = Array.from(Y.decodeStateVector(Y.encodeStateVector(a)).keys()).filter(
      (id) => id >= 2 ** 32
    );
    expect(derived).toHaveLength(2);
    // One lift won at key level: exactly one of the two element edits survived.
    const survived = [xOf(pageState(a), 's1') === 11, xOf(pageState(a), 's2') === 33];
    expect(survived.filter(Boolean)).toHaveLength(1);
  });
});
