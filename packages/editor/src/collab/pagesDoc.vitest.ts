// SPDX-License-Identifier: AGPL-3.0-only
import { posBetween as corePosBetween, stateKeyClasses, writeStateKeys } from '@ggraphic/core/ydoc';
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import {
  appendPage,
  buildPage,
  normalizePositions,
  duplicatePageById,
  foldLegacyFormStateIntoFirstPage,
  getPagesMap,
  insertPageAt,
  migrateLegacyDoc,
  movePageById,
  posBetween,
  readPages,
  removePageById,
  replacePageState,
  restorePageStateKeys,
  seedPageId,
  seedPagesIfEmpty,
  serializeDeck,
  setPageConfigById,
  updatePageStateById,
} from './pagesDoc.js';
import { YDOC_KEYS } from './ydocKeys.js';

/** Two docs kept in sync by applying each other's updates (a fake network). */
function syncedPair(): [Y.Doc, Y.Doc] {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') Y.applyUpdate(b, update, 'remote');
  });
  b.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') Y.applyUpdate(a, update, 'remote');
  });
  return [a, b];
}

/** Two independent docs merged only when `merge` is called (offline pair). */
function offlinePair(): { a: Y.Doc; b: Y.Doc; merge: () => void } {
  const a = new Y.Doc();
  const b = new Y.Doc();
  return {
    a,
    b,
    merge: () => {
      const ua = Y.encodeStateAsUpdate(a);
      const ub = Y.encodeStateAsUpdate(b);
      Y.applyUpdate(a, ub);
      Y.applyUpdate(b, ua);
    },
  };
}

const seedThree = (doc: Y.Doc) =>
  seedPagesIfEmpty(doc, [
    { id: 'p1', configId: 'slider', state: { headline: 'Eins' } },
    { id: 'p2', configId: 'slider', state: { headline: 'Zwei' } },
    { id: 'p3', configId: 'slider', state: { headline: 'Drei' } },
  ]);

describe('posBetween', () => {
  // Its own tests moved with it to `@ggraphic/core` (`src/ydoc/pos.vitest.ts`).
  it('is the core function, still reachable from this module', () => {
    expect(posBetween).toBe(corePosBetween);
  });
});

describe('tied pos keys (concurrent op collisions)', () => {
  it('normalizePositions re-spaces tied keys deterministically', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      { id: 'a', configId: 'slider', state: {} },
      { id: 'b', configId: 'slider', state: {} },
    ]);
    // Force a tie.
    const [first, second] = readPages(doc);
    second.yMap.set('pos', first.pos);

    normalizePositions(doc);
    const [na, nb] = readPages(doc);
    expect(na.pos < nb.pos).toBe(true);
    expect(readPages(doc).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('insert and move recover from tied keys instead of throwing', () => {
    const doc = new Y.Doc();
    seedThree(doc);
    const views = readPages(doc);
    views[1].yMap.set('pos', views[0].pos);
    views[2].yMap.set('pos', views[0].pos);

    expect(() => insertPageAt(doc, 1, { id: 'x', configId: 'slider', state: {} })).not.toThrow();
    expect(() => movePageById(doc, 'p3', 'up')).not.toThrow();
    const ids = readPages(doc).map((p) => p.id);
    expect([...ids].sort()).toEqual(['p1', 'p2', 'p3', 'x']);
  });
});

describe('page operations', () => {
  it('seeds pages in order and is idempotent', () => {
    const doc = new Y.Doc();
    expect(seedThree(doc)).toBe(true);
    expect(readPages(doc).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(seedThree(doc)).toBe(false);
  });

  it('append/insert/remove keep canonical order', () => {
    const doc = new Y.Doc();
    seedThree(doc);
    appendPage(doc, { id: 'p4', configId: 'slider', state: {} });
    insertPageAt(doc, 1, { id: 'p1b', configId: 'slider', state: {} });
    removePageById(doc, 'p2');
    expect(readPages(doc).map((p) => p.id)).toEqual(['p1', 'p1b', 'p3', 'p4']);
  });

  it('duplicate clones state and config right after the source', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      {
        id: 'p1',
        configId: 'headline',
        state: { line1: 'Grün' },
        config: { snapping: true, width: 1080 },
      },
      { id: 'p2', configId: 'headline', state: {} },
    ]);

    expect(duplicatePageById(doc, 'p1', 'copy')).toBe(true);
    const pages = readPages(doc);
    expect(pages.map((p) => p.id)).toEqual(['p1', 'copy', 'p2']);

    const copy = pages[1].yMap;
    expect(pages[1].state).toEqual({ line1: 'Grün' });
    const config = copy.get(YDOC_KEYS.config) as Y.Map<unknown>;
    expect(config.get('snapping')).toBe(true);
    expect(config.get('width')).toBe(1080);

    // Deep clone: mutating the copy's config leaves the original untouched.
    config.set('width', 99);
    const origConfig = pages[0].yMap.get(YDOC_KEYS.config) as Y.Map<unknown>;
    expect(origConfig.get('width')).toBe(1080);
  });

  it('move preserves the Y.Map identity and concurrent remote edits survive', () => {
    const [a, b] = syncedPair();
    seedThree(a);

    const pageOnA = readPages(a).find((p) => p.id === 'p2')!.yMap;
    movePageById(a, 'p2', 'up');
    expect(readPages(a).map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
    // Same Y.Map instance — no clone-delete-insert.
    expect(readPages(a).find((p) => p.id === 'p2')!.yMap).toBe(pageOnA);

    // A remote edit landing on the moved page is not lost.
    updatePageStateById(b, 'p2', { headline: 'Editiert' });
    expect(readPages(a).find((p) => p.id === 'p2')!.state.headline).toBe('Editiert');
  });

  it('concurrent reorders converge without duplicating or dropping pages', () => {
    const { a, b, merge } = offlinePair();
    seedThree(a);
    const ua = Y.encodeStateAsUpdate(a);
    Y.applyUpdate(b, ua);

    movePageById(a, 'p3', 'up');
    movePageById(b, 'p1', 'down');
    merge();

    const idsA = readPages(a).map((p) => p.id);
    const idsB = readPages(b).map((p) => p.id);
    expect(idsA).toEqual(idsB);
    expect([...idsA].sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('double-seed race with deterministic ids converges to one page set', () => {
    const { a, b, merge } = offlinePair();
    const defs = (headline: string) => [
      { id: seedPageId(0), configId: 'slider', state: { headline } },
      { id: seedPageId(1), configId: 'slider', state: { headline } },
    ];
    seedPagesIfEmpty(a, defs('von A'));
    seedPagesIfEmpty(b, defs('von B'));
    merge();

    expect(readPages(a)).toHaveLength(2);
    expect(readPages(b)).toHaveLength(2);
    expect(readPages(a).map((p) => p.id)).toEqual(readPages(b).map((p) => p.id));
  });

  it('updatePageState guards structurally equal object values', () => {
    const doc = new Y.Doc();
    seedThree(doc);
    updatePageStateById(doc, 'p1', { imageOffset: { x: 1, y: 2 } });

    let fired = 0;
    getPagesMap(doc).observeDeep(() => {
      fired += 1;
    });
    updatePageStateById(doc, 'p1', { imageOffset: { x: 1, y: 2 } });
    expect(fired).toBe(0);
    updatePageStateById(doc, 'p1', { imageOffset: { x: 3, y: 2 } });
    expect(fired).toBe(1);
  });

  it('setPageConfig replaces configId and state but keeps id and pos', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [{ id: 'p1', configId: 'zitat', state: { quote: 'Hallo' } }]);
    const before = readPages(doc)[0];
    setPageConfigById(doc, 'p1', 'info', { header: 'Neu' });

    const after = readPages(doc)[0];
    expect(after.configId).toBe('info');
    expect(after.state).toEqual({ header: 'Neu' });
    expect(after.pos).toBe(before.pos);
    expect(after.yMap).toBe(before.yMap);
  });

  it('serializeDeck returns pages in order with config', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      { id: 'p1', configId: 'slider', state: { headline: 'A' }, config: { width: 1080 } },
      { id: 'p2', configId: 'slider', state: { headline: 'B' } },
    ]);
    movePageById(doc, 'p2', 'up');

    const deck = serializeDeck(doc);
    expect(deck.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(deck[1].config).toEqual({ width: 1080 });
    expect(deck[0].config).toEqual({});
  });
});

describe('legacy migration', () => {
  it('lifts a legacy pages Y.Array into pagesById preserving order and config', () => {
    const doc = new Y.Doc();
    const legacy = doc.getArray<Y.Map<unknown>>(YDOC_KEYS.pages);
    doc.transact(() => {
      const p1 = buildPage(
        doc,
        { id: 'a', configId: 'slider', state: { headline: '1' }, config: { width: 1080 } },
        'ignored'
      );
      p1.delete(YDOC_KEYS.pos);
      const p2 = buildPage(
        doc,
        { id: 'b', configId: 'slider', state: { headline: '2' } },
        'ignored'
      );
      p2.delete(YDOC_KEYS.pos);
      legacy.push([p1, p2]);
    });

    doc.transact(() => migrateLegacyDoc(doc));

    expect(legacy.length).toBe(0);
    const pages = readPages(doc);
    expect(pages.map((p) => p.id)).toEqual(['a', 'b']);
    const config = pages[0].yMap.get(YDOC_KEYS.config) as Y.Map<unknown>;
    expect(config.get('width')).toBe(1080);

    // Idempotent.
    doc.transact(() => migrateLegacyDoc(doc));
    expect(readPages(doc)).toHaveLength(2);
  });

  it('promotes legacy_root config into a single page', () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      doc.getMap<unknown>(YDOC_KEYS.legacyRoot).set('marker', true);
      doc.getMap<unknown>(YDOC_KEYS.config).set('width', 1080);
    });

    doc.transact(() => migrateLegacyDoc(doc));
    const pages = readPages(doc);
    expect(pages).toHaveLength(1);
    const config = pages[0].yMap.get(YDOC_KEYS.config) as Y.Map<unknown>;
    expect(config.get('width')).toBe(1080);
    // Der alte Top-Level-Typ ist danach leer.
    expect(doc.getMap<unknown>(YDOC_KEYS.config).size).toBe(0);
  });

  it('folds legacy formState into a single page once', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [{ id: 'p1', configId: 'zitat', state: { quote: 'Alt' } }]);
    doc.getMap<unknown>(YDOC_KEYS.formState).set('quote', 'Editiert');
    doc.getMap<unknown>(YDOC_KEYS.formState).set('_seeded', true);

    doc.transact(() => foldLegacyFormStateIntoFirstPage(doc));
    expect(readPages(doc)[0].state.quote).toBe('Editiert');
    // Internal markers stay out of page state.
    expect('_seeded' in readPages(doc)[0].state).toBe(false);

    // One-shot: later formState garbage is not re-applied.
    doc.getMap<unknown>(YDOC_KEYS.formState).set('quote', 'Später');
    doc.transact(() => foldLegacyFormStateIntoFirstPage(doc));
    expect(readPages(doc)[0].state.quote).toBe('Editiert');
  });

  it('does not fold formState into multi-page docs (but marks them folded)', () => {
    const doc = new Y.Doc();
    seedThree(doc);
    doc.getMap<unknown>(YDOC_KEYS.formState).set('headline', 'Gemischt');
    doc.transact(() => foldLegacyFormStateIntoFirstPage(doc));
    expect(readPages(doc)[0].state.headline).toBe('Eins');
    expect(doc.getMap<unknown>(YDOC_KEYS.meta).get(YDOC_KEYS.formStateFolded)).toBe(true);
  });

  it('does NOT mark 0-page docs folded — the fold must still run after the seed', () => {
    const doc = new Y.Doc();
    doc.getMap<unknown>(YDOC_KEYS.formState).set('quote', 'Chat');
    doc.transact(() => foldLegacyFormStateIntoFirstPage(doc));
    expect(doc.getMap<unknown>(YDOC_KEYS.meta).get(YDOC_KEYS.formStateFolded)).toBeUndefined();

    // Seed later (client fallback) → fold applies the chat content.
    seedPagesIfEmpty(doc, [{ id: 'seed-0', configId: 'zitat', state: { quote: 'Default' } }]);
    doc.transact(() => foldLegacyFormStateIntoFirstPage(doc));
    expect(readPages(doc)[0].state.quote).toBe('Chat');
  });
});

describe('reads through the codec', () => {
  const classes = stateKeyClasses([]);
  const SHAPES = [
    { id: 'a', x: 1, y: 2, fill: { type: 'solid', color: '#f00' } },
    { id: 'b', x: 3, y: 4 },
  ];
  const STATE = {
    headline: 'Hallo',
    shapeInstances: SHAPES,
    layerOrder: ['b', 'a'],
    iconStates: { i1: { x: 1 } },
  };

  /** A doc with one page whose state is `STATE`; `structured` stores it the version 4 way. */
  const docWith = (structured: boolean): Y.Doc => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [{ id: 'p', configId: 'fixture', state: { headline: 'Hallo' } }]);
    if (structured) {
      doc.getMap(YDOC_KEYS.meta).set(YDOC_KEYS.schemaVersion, 4);
      const stateY = readPages(doc)[0]!.yMap.get(YDOC_KEYS.state) as Y.Map<unknown>;
      writeStateKeys(stateY, STATE, { classes, lift: true });
    } else {
      updatePageStateById(doc, 'p', STATE);
    }
    return doc;
  };
  const stateMap = (doc: Y.Doc) => readPages(doc)[0]!.yMap.get(YDOC_KEYS.state) as Y.Map<unknown>;
  const updates = (doc: Y.Doc, run: () => void): number => {
    let count = 0;
    const on = () => count++;
    doc.on('update', on);
    run();
    doc.off('update', on);
    return count;
  };

  it('stores the structured fixture as structures', () => {
    expect(stateMap(docWith(true)).get('shapeInstances')).toBeInstanceOf(Y.Map);
    expect(stateMap(docWith(false)).get('shapeInstances')).toBeInstanceOf(Array);
  });

  it('readPages returns the same state for plain and structured storage', () => {
    expect(readPages(docWith(true))[0]!.state).toEqual(readPages(docWith(false))[0]!.state);
  });

  it('serializeDeck returns the same deck for plain and structured storage', () => {
    expect(serializeDeck(docWith(true))).toEqual(serializeDeck(docWith(false)));
  });

  it('keeps the identity of unchanged structured values across reads', () => {
    const doc = docWith(true);
    const first = readPages(doc)[0]!.state;
    const second = readPages(doc)[0]!.state;
    expect(second.shapeInstances).toBe(first.shapeInstances);
    stateMap(doc).doc!.transact(() => {
      ((stateMap(doc).get('shapeInstances') as Y.Map<unknown>).get('a') as Y.Map<unknown>).set(
        'x',
        9
      );
    });
    const third = readPages(doc)[0]!.state.shapeInstances as { id: string; x: number }[];
    expect(third.find((s) => s.id === 'a')!.x).toBe(9);
    expect(third.find((s) => s.id === 'b')).toBe(
      (first.shapeInstances as { id: string }[]).find((s) => s.id === 'b')
    );
    expect(readPages(doc)[0]!.state.layerOrder).toBe(first.layerOrder);
  });

  it('updatePageStateById writes nothing for an equal plain value over a structure', () => {
    const doc = docWith(true);
    const reordered = [{ y: 2, fill: { color: '#f00', type: 'solid' }, x: 1, id: 'a' }, SHAPES[1]];
    expect(
      updates(doc, () =>
        updatePageStateById(doc, 'p', { shapeInstances: reordered, layerOrder: ['b', 'a'] })
      )
    ).toBe(0);
    expect(stateMap(doc).get('shapeInstances')).toBeInstanceOf(Y.Map);
  });

  it('replacePageState writes nothing for an equal plain value over a structure', () => {
    const doc = docWith(true);
    expect(updates(doc, () => replacePageState(doc, 'p', { ...STATE }))).toBe(0);
    expect(stateMap(doc).get('layerOrder')).toBeInstanceOf(Y.Map);
  });

  it('restorePageStateKeys reads the live value through the codec', () => {
    const doc = docWith(true);
    const seen: unknown[] = [];
    expect(
      updates(doc, () =>
        restorePageStateKeys(
          doc,
          'p',
          STATE,
          ['shapeInstances', 'layerOrder'],
          (_key, live) => (seen.push(live), true)
        )
      )
    ).toBe(0);
    expect(seen).toEqual([SHAPES, ['b', 'a']]);
    expect(stateMap(doc).get('shapeInstances')).toBeInstanceOf(Y.Map);
  });

  it('still writes a changed value, and deletes an absent key, over a structure', () => {
    const doc = docWith(true);
    restorePageStateKeys(doc, 'p', { headline: 'x' }, ['shapeInstances', 'headline'], () => true);
    expect(readPages(doc)[0]!.state).toEqual({
      headline: 'x',
      layerOrder: ['b', 'a'],
      iconStates: { i1: { x: 1 } },
    });
  });
});
