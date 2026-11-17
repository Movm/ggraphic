// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Randomised: several clients hold the same version 3 document and open it (the editor's open:
 * the lift under the deterministic identity) at random times: before or after they received
 * some of the others' updates. Once open, each edits through the editor's writer from its own
 * view. The network is a relay server, as the host's sync server is: each client's updates reach
 * the server in order, the server applies them and forwards each to every other client in the
 * order it received them, and both hops are delivered at random times. That keeps causal order:
 * a client edits only what it has, and the server forwards what it had before the edit first.
 * (A transport without causal order, peer to peer, can deliver a peer's plain edit before the
 * lift that peer received; the two openers then start from different states and fall back to
 * key-level last-writer-wins: `concurrentLiftOffline.vitest.tsx`, "remaining case".)
 * At the end everything is delivered, and:
 * - every client holds the same document, version 4, every collection structured;
 * - every edit to an element no other client touched is in the result.
 *
 * Every fourth seed adds the server's own plain writes (an old writer or a server patch: they
 * give openers different starting states, and the plain key wins at key level) and keeps one
 * client mounted, so its `meta` observer re-settles the document while others' lifts arrive.
 * Those runs assert convergence only: edits can be lost there by design.
 *
 * Before the deterministic lift identity, a client that edited before another's lift reached it
 * lost those edits whenever its own lift lost at key level. Bounded for CI;
 * `ELEMENT_STORAGE_RANDOM_SEEDS=<n>` runs more seeds locally.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { isStructured, schemaVersionOf, v3Doc } from './__tests__/elementStorageKit.js';
import { readPages, serializeDeck, updatePageStateById } from './pagesDoc.js';
import { PAGES_STATE_ORIGIN, useYjsPages } from './useYjsPages.js';

const PAGE = 'seed-0';
const SHAPES = 'shapeInstances';
type Shape = { id: string } & Record<string, unknown>;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function run(seed: number, clientCount: number, steps: number) {
  const random = rng(seed);
  const chaos = seed % 4 === 0;
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const initial: Shape[] = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, x: i, fill: '#0' }));
  const server = v3Doc(
    [
      {
        id: PAGE,
        configId: 'fixture-poster',
        state: { [SHAPES]: initial, layerOrder: initial.map((s) => s.id), headline: 'h' },
      },
    ],
    999
  );
  const docs = Array.from({ length: clientCount }, (_, i) => {
    const doc = new Y.Doc();
    doc.clientID = i + 1;
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(server));
    return doc;
  });
  // Client → server and server → client, each in order.
  const up = docs.map(() => [] as Uint8Array[]);
  const down = docs.map(() => [] as Uint8Array[]);
  docs.forEach((doc, c) =>
    doc.on('update', (update: Uint8Array, by: unknown) => by !== 'net' && up[c]!.push(update))
  );
  const deliverOne = () => {
    const hops: [boolean, number][] = [];
    up.forEach((q, c) => q.length > 0 && hops.push([true, c]));
    down.forEach((q, c) => q.length > 0 && hops.push([false, c]));
    if (hops.length === 0) return false;
    const [toServer, c] = pick(hops);
    if (toServer) {
      const update = up[c]!.shift()!;
      Y.applyUpdate(server, update, 'net');
      down.forEach((q, other) => other !== c && q.push(update));
    } else {
      Y.applyUpdate(docs[c]!, down[c]!.shift()!, 'net');
    }
    return true;
  };
  // The server's own plain write, relayed like any update.
  const serverWrite = (step: number) => {
    let update: Uint8Array | null = null;
    server.once('update', (u: Uint8Array) => (update = u));
    server.transact(() => {
      const stateY = (server.getMap('pagesById').get(PAGE) as Y.Map<unknown>).get(
        'state'
      ) as Y.Map<unknown>;
      if (random() < 0.5) stateY.set('headline', `server-${step}`);
      else stateY.set(SHAPES, [{ id: `srv-${step}`, x: step, fill: '#s' }]);
    });
    if (update) down.forEach((q) => q.push(update!));
  };
  // A client that stays mounted: its meta observer re-settles on others' stamps.
  let mounted: { unmount: () => void } | null = null;

  const opened = docs.map(() => false);
  const open = (c: number) => {
    const hook = renderHook(() => useYjsPages(docs[c]!, true, null, true));
    if (chaos && c === 0) mounted = hook;
    else hook.unmount();
    opened[c] = true;
  };
  // Per element: who touched it, and the last value of each prop its only toucher wrote.
  const touches = new Map<
    string,
    { clients: Set<number>; last: Map<string, unknown>; deleted: boolean }
  >();
  const touch = (id: string, c: number) => {
    let t = touches.get(id);
    if (!t) touches.set(id, (t = { clients: new Set(), last: new Map(), deleted: false }));
    t.clients.add(c);
    return t;
  };
  let minted = 0;

  for (let step = 0; step < steps; step++) {
    const r = random();
    if (r < 0.4) {
      // Through act, with the microtasks the mounted client's observer queues.
      if (mounted) await act(async () => void deliverOne());
      else deliverOne();
      continue;
    }
    if (chaos && r < 0.43) {
      serverWrite(step);
      continue;
    }
    const c = Math.floor(random() * clientCount);
    if (!opened[c]) {
      if (r < 0.55) open(c);
      continue;
    }
    const doc = docs[c]!;
    const shapes = (readPages(doc)[0]!.state[SHAPES] as Shape[]).map((s) => ({ ...s }));
    const write = (partial: Record<string, unknown>) =>
      doc.transact(() => updatePageStateById(doc, PAGE, partial), PAGES_STATE_ORIGIN);
    const op = random();
    if (op < 0.5 && shapes.length > 0) {
      const target = pick(shapes);
      const prop = pick(['x', 'fill'] as const);
      const value = prop === 'x' ? step * 10 + c : `#c${c}-${step}`;
      target[prop] = value;
      touch(target.id, c).last.set(prop, value);
      write({ [SHAPES]: shapes });
    } else if (op < 0.65 && shapes.length > 1) {
      const [moved] = shapes.splice(Math.floor(random() * shapes.length), 1);
      shapes.splice(Math.floor(random() * (shapes.length + 1)), 0, moved!);
      touch(moved!.id, c);
      write({ [SHAPES]: shapes });
    } else if (op < 0.8) {
      const id = `c${c}-${minted++}`;
      shapes.push({ id, x: step, fill: '#f' });
      const t = touch(id, c);
      t.last.set('x', step);
      t.last.set('fill', '#f');
      write({ [SHAPES]: shapes });
    } else if (op < 0.88 && shapes.length > 0) {
      const target = pick(shapes);
      touch(target.id, c).deleted = true;
      write({ [SHAPES]: shapes.filter((s) => s.id !== target.id) });
    } else {
      write({ headline: `h-${c}-${step}` });
    }
  }
  docs.forEach((_, c) => !opened[c] && open(c));
  if (mounted) {
    await act(async () => {
      while (deliverOne());
    });
    // Let the re-settle's writes go out and come back.
    for (let i = 0; i < 3; i++) await act(async () => void (await Promise.resolve()));
  }
  while (deliverOne());
  (mounted as { unmount: () => void } | null)?.unmount();

  const label = `seed ${seed}`;
  const finals = docs.map((doc) => serializeDeck(doc));
  for (const deck of finals.slice(1)) expect(deck, label).toEqual(finals[0]);
  expect(serializeDeck(server), label).toEqual(finals[0]);
  for (const doc of docs) expect(schemaVersionOf(doc), label).toBe(4);
  if (chaos) return;
  for (const doc of docs) expect(isStructured(doc, SHAPES), label).toBe(true);
  const byId = new Map((finals[0]![0]!.state[SHAPES] as Shape[]).map((s) => [s.id, s]));
  for (const [id, t] of touches) {
    if (t.clients.size !== 1) continue;
    const final = byId.get(id);
    if (t.deleted) {
      expect(final, `${label}: ${id} deleted by its only toucher`).toBeUndefined();
      continue;
    }
    expect(final, `${label}: ${id}`).toBeDefined();
    for (const [prop, value] of t.last)
      expect(final![prop], `${label}: ${id}.${prop}`).toEqual(value);
  }
  for (const original of initial) {
    if (!touches.has(original.id)) expect(byId.get(original.id), label).toEqual(original);
  }
}

const SEEDS = Number(process.env['ELEMENT_STORAGE_RANDOM_SEEDS'] ?? 25);

describe('random opens of one version 3 document, edits and delivery', () => {
  it(`converge and keep every untouched-by-others edit (${SEEDS} seeds, 3 clients)`, async () => {
    for (let seed = 1; seed <= SEEDS; seed++) await run(seed, 3, 120);
  }, 120_000);

  it('also with four clients', async () => {
    for (let seed = 1; seed <= Math.ceil(SEEDS / 3); seed++) await run(500 + seed, 4, 160);
  }, 120_000);
});
