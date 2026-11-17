// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Randomised: several clients edit one version 4 page through the editor's writer
 * (`updatePageStateById`, each from its own view of the document, as a mounted canvas emits),
 * while a network delivers their updates in random order and at random times. At the end
 * everything is delivered, and:
 * - every client holds the same document (convergence);
 * - no id is listed twice in a collection or an id list;
 * - every edit a client made to an element no other client touched (edited, moved, deleted)
 *   is in the final document, and an element only its creator touched is there.
 *
 * Bounded for CI. `ELEMENT_STORAGE_RANDOM_SEEDS=<n>` runs more seeds locally.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { stampYDocument } from './documentVersion.js';
import { readPages, seedPagesIfEmpty, serializeDeck, updatePageStateById } from './pagesDoc.js';
import { PAGES_STATE_ORIGIN } from './useYjsPages.js';
import { YDOC_KEYS } from './ydocKeys.js';

const PAGE = 'seed-0';
const SHAPES = 'shapeInstances';
const PROPS = ['x', 'y', 'fill'] as const;

type Shape = { id: string } & Record<string, unknown>;

/** mulberry32: a small seeded generator, so a failing seed can be replayed. */
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

interface Touch {
  clients: Set<number>;
  deletedBy: number | null;
  createdBy: number | null;
  /** The last value each prop got from its only toucher. */
  last: Map<string, unknown>;
}

function run(seed: number, clientCount: number, steps: number) {
  const random = rng(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;

  const initial: Shape[] = Array.from({ length: 6 }, (_, i) => ({
    id: `s${i}`,
    x: i,
    y: i,
    fill: '#000',
  }));
  const origin = new Y.Doc();
  origin.transact(() => {
    stampYDocument(origin);
    seedPagesIfEmpty(origin, [
      {
        id: PAGE,
        configId: 'fixture-poster',
        state: {
          [SHAPES]: initial,
          layerOrder: initial.map((s) => s.id),
          lockedLayerIds: [],
        },
      },
    ]);
  });
  expect(origin.getMap(YDOC_KEYS.meta).get(YDOC_KEYS.schemaVersion)).toBe(4);

  const docs = Array.from({ length: clientCount }, (_, i) => {
    const doc = new Y.Doc();
    doc.clientID = i + 1;
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(origin));
    return doc;
  });
  // queues[from][to]: updates `from` made that `to` has not received yet.
  const queues = docs.map(() => docs.map(() => [] as Uint8Array[]));
  docs.forEach((doc, from) =>
    doc.on('update', (update: Uint8Array, by: unknown) => {
      if (by === 'net') return;
      docs.forEach((_, to) => to !== from && queues[from]![to]!.push(update));
    })
  );
  const deliverOne = () => {
    const pending: [number, number][] = [];
    queues.forEach((row, from) => row.forEach((q, to) => q.length > 0 && pending.push([from, to])));
    if (pending.length === 0) return false;
    const [from, to] = pick(pending);
    const queue = queues[from]![to]!;
    // Any update of the queue, not only the oldest: Yjs keeps what it cannot integrate yet.
    const [update] = queue.splice(Math.floor(random() * queue.length), 1);
    Y.applyUpdate(docs[to]!, update!, 'net');
    return true;
  };

  const touches = new Map<string, Touch>();
  const touch = (id: string, client: number): Touch => {
    let t = touches.get(id);
    if (!t) {
      t = { clients: new Set(), deletedBy: null, createdBy: null, last: new Map() };
      touches.set(id, t);
    }
    t.clients.add(client);
    return t;
  };
  let minted = 0;

  for (let step = 0; step < steps; step++) {
    if (random() < 0.45) {
      deliverOne();
      continue;
    }
    const c = Math.floor(random() * clientCount);
    const doc = docs[c]!;
    const view = readPages(doc)[0]!.state;
    const shapes = (view[SHAPES] as Shape[]).map((s) => ({ ...s }));
    const layerOrder = [...(view.layerOrder as string[])];
    const locked = [...(view.lockedLayerIds as string[])];
    const write = (partial: Record<string, unknown>) =>
      doc.transact(() => updatePageStateById(doc, PAGE, partial), PAGES_STATE_ORIGIN);
    const op = random();

    if (op < 0.4 && shapes.length > 0) {
      const target = pick(shapes);
      const prop = pick(PROPS);
      const value = prop === 'fill' ? `#c${c}-${step}` : step * 10 + c;
      target[prop] = value;
      touch(target.id, c).last.set(prop, value);
      write({ [SHAPES]: shapes });
    } else if (op < 0.55 && shapes.length > 1) {
      const from = Math.floor(random() * shapes.length);
      const [moved] = shapes.splice(from, 1);
      shapes.splice(Math.floor(random() * (shapes.length + 1)), 0, moved!);
      touch(moved!.id, c);
      write({ [SHAPES]: shapes });
    } else if (op < 0.7) {
      const id = `c${c}-${minted++}`;
      const created: Shape = { id, x: step, y: step, fill: '#fff' };
      shapes.splice(Math.floor(random() * (shapes.length + 1)), 0, created);
      layerOrder.push(id);
      const t = touch(id, c);
      t.createdBy = c;
      for (const prop of PROPS) t.last.set(prop, created[prop]);
      write({ [SHAPES]: shapes, layerOrder });
    } else if (op < 0.8 && shapes.length > 0) {
      const target = pick(shapes);
      touch(target.id, c).deletedBy = c;
      write({
        [SHAPES]: shapes.filter((s) => s.id !== target.id),
        layerOrder: layerOrder.filter((id) => id !== target.id),
        lockedLayerIds: locked.filter((id) => id !== target.id),
      });
    } else if (op < 0.9 && layerOrder.length > 1) {
      const from = Math.floor(random() * layerOrder.length);
      const [moved] = layerOrder.splice(from, 1);
      layerOrder.splice(Math.floor(random() * (layerOrder.length + 1)), 0, moved!);
      write({ layerOrder });
    } else if (shapes.length > 0) {
      const id = pick(shapes).id;
      write({
        lockedLayerIds: locked.includes(id) ? locked.filter((l) => l !== id) : [...locked, id],
      });
    }
  }
  while (deliverOne());

  const label = `seed ${seed}`;
  const finals = docs.map((doc) => serializeDeck(doc));
  for (const deck of finals.slice(1)) expect(deck, label).toEqual(finals[0]);
  for (const doc of docs.slice(1)) {
    expect(Y.encodeStateVector(doc), label).toEqual(Y.encodeStateVector(docs[0]!));
  }

  const state = finals[0]![0]!.state;
  const shapes = state[SHAPES] as Shape[];
  const byId = new Map(shapes.map((s) => [s.id, s]));
  expect(byId.size, label).toBe(shapes.length);
  for (const key of ['layerOrder', 'lockedLayerIds']) {
    const ids = state[key] as string[];
    expect(new Set(ids).size, `${label} ${key}`).toBe(ids.length);
  }

  for (const original of initial) {
    if (!touches.has(original.id)) expect(byId.get(original.id), label).toEqual(original);
  }
  for (const [id, t] of touches) {
    if (t.clients.size !== 1) continue;
    const only = [...t.clients][0]!;
    if (t.createdBy !== null && t.createdBy !== only) continue;
    const final = byId.get(id);
    if (t.deletedBy === only) {
      expect(final, `${label}: ${id} deleted by its only toucher`).toBeUndefined();
      continue;
    }
    expect(final, `${label}: ${id} touched only by client ${only}`).toBeDefined();
    for (const [prop, value] of t.last) {
      expect(final![prop], `${label}: ${id}.${prop} by client ${only}`).toEqual(value);
    }
  }
}

const SEEDS = Number(process.env['ELEMENT_STORAGE_RANDOM_SEEDS'] ?? 40);

describe('random concurrent element edits through the editor writer', () => {
  it(`converge and keep every untouched-by-others edit (${SEEDS} seeds, 3 clients)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) run(seed, 3, 120);
  });

  it('also with five clients', () => {
    for (let seed = 1; seed <= Math.ceil(SEEDS / 4); seed++) run(1000 + seed, 5, 160);
  });
});
