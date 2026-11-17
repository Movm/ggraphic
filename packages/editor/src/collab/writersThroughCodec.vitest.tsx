// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The editor's writers go through the page-state codec (`@ggraphic/core/ydoc`): a single-property
 * edit reaches the Y.Doc as that property only, not as the whole collection, and every other
 * writer (`replaceDeck`, `setPageConfigById`, duplicating a page, `restorePageStateKeys`, a new
 * page) produces the JSON view it produced before. In a version 4 document they create structures;
 * in a version 3 document they write plain JSON. JSON-view cases and storage cases are separate
 * tests, so a failure says which half is missing.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  PAGE_ID,
  SHAPES,
  deckJson,
  isStructured,
  mountClient,
  replicaOf,
  shape,
  stateMapOf,
  updateShape,
  v3Doc,
  v4Doc,
  json,
  type Shape,
} from './__tests__/elementStorageKit.js';
import {
  appendPage,
  duplicatePageById,
  readPages,
  replaceDeck,
  restorePageStateKeys,
  serializeDeck,
  setPageConfigById,
  updatePageStateById,
} from './pagesDoc.js';
import { PAGES_STATE_ORIGIN } from './useYjsPages.js';
import { YDOC_KEYS } from './ydocKeys.js';

const TEN = Array.from({ length: 10 }, (_, i) => shape(`s${i + 1}`, 100 + i));
const STATE = { headline: 'Eins', [SHAPES]: TEN, layerOrder: TEN.map((s) => s.id) };
const page = (id: string, state: Record<string, unknown>) => ({
  id,
  configId: 'fixture-poster',
  state,
});

/** What a peer that applies `update` to `before` sees change: element path and changed properties. */
function changes(before: Y.Doc, update: Uint8Array): [string, string][] {
  const seen: [string, string][] = [];
  before.getMap(YDOC_KEYS.pagesById).observeDeep((events) => {
    for (const event of events) {
      seen.push([event.path.join('/'), [...event.keys.keys()].sort().join(',')]);
    }
  });
  Y.applyUpdate(before, update);
  return seen;
}

/** Write inside the editor's usual origin; returns the one Y update and a replica from before it. */
function write(doc: Y.Doc, run: () => void): { before: Y.Doc; update: Uint8Array } {
  const before = replicaOf(doc);
  const updates: Uint8Array[] = [];
  const on = (u: Uint8Array) => updates.push(u);
  doc.on('update', on);
  doc.transact(run, PAGES_STATE_ORIGIN);
  doc.off('update', on);
  expect(updates).toHaveLength(1);
  return { before, update: updates[0]! };
}
const changesOf = (doc: Y.Doc, run: () => void) => {
  const { before, update } = write(doc, run);
  return changes(before, update);
};

const edit = (id: string, patch: Record<string, unknown>) =>
  TEN.map((s) => (s.id === id ? { ...s, ...patch } : s));

describe('a single-property edit writes that property only (version 4 document)', () => {
  const at = (path: string) => `${PAGE_ID}/state/${path}`;

  it('x of one shape: one change, on that shape, to x', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    const seen = changesOf(doc, () =>
      updatePageStateById(doc, PAGE_ID, { [SHAPES]: edit('s3', { x: 999 }) })
    );
    expect(seen).toEqual([[at(`${SHAPES}/s3`), 'x']]);
  });

  it('is much smaller than writing the collection', () => {
    const structured = v4Doc([page(PAGE_ID, STATE)]);
    const plain = v3Doc([page(PAGE_ID, STATE)]);
    const small = write(structured, () =>
      updatePageStateById(structured, PAGE_ID, { [SHAPES]: edit('s3', { x: 999 }) })
    ).update;
    const whole = write(plain, () =>
      updatePageStateById(plain, PAGE_ID, { [SHAPES]: edit('s3', { x: 999 }) })
    ).update;
    expect(small.byteLength * 3).toBeLessThan(whole.byteLength);
  });

  it('moving one shape in the list: one change, to its order key', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    const moved = [TEN[0]!, ...TEN.slice(2, 5), TEN[1]!, ...TEN.slice(5)];
    const seen = changesOf(doc, () => updatePageStateById(doc, PAGE_ID, { [SHAPES]: moved }));
    expect(seen).toEqual([[at(`${SHAPES}/s2`), '$pos']]);
    expect(readPages(doc)[0]!.state[SHAPES]).toEqual(moved);
  });

  it('removing one shape: one change, to the collection, naming that shape', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    const seen = changesOf(doc, () =>
      updatePageStateById(doc, PAGE_ID, { [SHAPES]: TEN.filter((s) => s.id !== 's5') })
    );
    expect(seen).toEqual([[at(SHAPES), 's5']]);
  });

  it('adding one shape: it comes in as one element, the others are not rewritten', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    const seen = changesOf(doc, () =>
      updatePageStateById(doc, PAGE_ID, { [SHAPES]: [...TEN, shape('s11', 5)] })
    );
    expect(seen).toEqual([[at(SHAPES), 's11']]);
  });

  it('adding a layer id: one change, to the layer order, naming that id', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    const seen = changesOf(doc, () =>
      updatePageStateById(doc, PAGE_ID, { layerOrder: [...STATE.layerOrder, 's11'] })
    );
    expect(seen).toEqual([[at('layerOrder'), 's11']]);
  });

  it('a plain key next to the structures is written as before', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    const seen = changesOf(doc, () => updatePageStateById(doc, PAGE_ID, { headline: 'Zwei' }));
    expect(seen).toEqual([[`${PAGE_ID}/state`, 'headline']]);
    expect(deckJson(doc)[0]!.state.headline).toBe('Zwei');
  });

  it('the canvas emit path writes the same: one change, on the edited shape, to x', async () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    const client = await mountClient(doc);
    const updates: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(u));
    const before = replicaOf(doc);

    await updateShape(client, 's3', { x: 999 });

    expect(updates.length).toBeGreaterThan(0);
    const seen: [string, string][] = [];
    before.getMap(YDOC_KEYS.pagesById).observeDeep((events) => {
      for (const event of events) {
        seen.push([event.path.join('/'), [...event.keys.keys()].sort().join(',')]);
      }
    });
    for (const u of updates) Y.applyUpdate(before, u);
    expect(seen.filter(([path]) => path.includes(SHAPES))).toEqual([[at(`${SHAPES}/s3`), 'x']]);
  }, 90_000);
});

describe('writers in a version 3 document', () => {
  it('write plain JSON, as before', () => {
    const doc = v3Doc([page(PAGE_ID, STATE)]);
    doc.transact(() => updatePageStateById(doc, PAGE_ID, { [SHAPES]: edit('s3', { x: 999 }) }));
    expect(isStructured(doc, SHAPES)).toBe(false);
    expect(Array.isArray(stateMapOf(doc).get(SHAPES))).toBe(true);
    expect(readPages(doc)[0]!.state[SHAPES]).toEqual(edit('s3', { x: 999 }));
  });

  it('a new page is plain', () => {
    const doc = v3Doc([page(PAGE_ID, STATE)]);
    doc.transact(() => appendPage(doc, page('p2', { [SHAPES]: [shape('a', 1)] })));
    expect(Array.isArray(stateMapOf(doc, 'p2').get(SHAPES))).toBe(true);
  });
});

describe('writers in a version 4 document: storage', () => {
  it('a new page is created structured', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    doc.transact(() =>
      appendPage(doc, page('p2', { [SHAPES]: [shape('a', 1)], layerOrder: ['a'], headline: 'x' }))
    );
    expect(isStructured(doc, SHAPES, 'p2')).toBe(true);
    expect(isStructured(doc, 'layerOrder', 'p2')).toBe(true);
    expect(isStructured(doc, 'headline', 'p2')).toBe(false);
  });

  it('a write over plain data under a version 4 stamp lifts the key (lift on write)', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    doc.transact(() => stateMapOf(doc).set(SHAPES, json(TEN)), 'old-writer');
    expect(isStructured(doc, SHAPES)).toBe(false);
    doc.transact(() => updatePageStateById(doc, PAGE_ID, { [SHAPES]: edit('s3', { x: 999 }) }));
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(readPages(doc)[0]!.state[SHAPES]).toEqual(edit('s3', { x: 999 }));
  });

  it('replaceDeck writes structures for the updated and the inserted pages', () => {
    const doc = v4Doc([page('p1', STATE), page('p2', { [SHAPES]: [shape('z', 1)] })]);
    doc.transact(() =>
      replaceDeck(
        doc,
        {
          updates: [{ pageId: 'p1', state: { [SHAPES]: [shape('n1', 7)], layerOrder: ['n1'] } }],
          inserts: [
            {
              afterPageId: 'p1',
              configId: 'fixture-poster',
              pageId: 'p3',
              state: { [SHAPES]: [shape('i', 2)] },
            },
          ],
          removes: ['p2'],
        },
        'deck-op'
      )
    );
    expect(isStructured(doc, SHAPES, 'p1')).toBe(true);
    expect(isStructured(doc, 'layerOrder', 'p1')).toBe(true);
    expect(isStructured(doc, SHAPES, 'p3')).toBe(true);
  });

  it('setPageConfigById builds the new state structured', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    doc.transact(() =>
      setPageConfigById(doc, PAGE_ID, 'fixture-poster', {
        [SHAPES]: [shape('n1', 7)],
        layerOrder: ['n1'],
      })
    );
    expect(isStructured(doc, SHAPES)).toBe(true);
    expect(isStructured(doc, 'layerOrder')).toBe(true);
  });

  it('a duplicated page is structured and independent of its source', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    doc.transact(() => duplicatePageById(doc, PAGE_ID, 'copy'));
    expect(isStructured(doc, SHAPES, 'copy')).toBe(true);
    expect(isStructured(doc, 'layerOrder', 'copy')).toBe(true);
    doc.transact(() => updatePageStateById(doc, PAGE_ID, { [SHAPES]: edit('s3', { x: 999 }) }));
    const copy = readPages(doc).find((p) => p.id === 'copy')!.state;
    expect((copy[SHAPES] as Shape[]).find((s) => s.id === 's3')!.x).toBe(102);
  });

  it('restorePageStateKeys leaves a restored key structured', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    doc.transact(() => updatePageStateById(doc, PAGE_ID, { [SHAPES]: edit('s3', { x: 999 }) }));
    doc.transact(() => restorePageStateKeys(doc, PAGE_ID, { [SHAPES]: TEN }, [SHAPES], () => true));
    expect(isStructured(doc, SHAPES)).toBe(true);
  });
});

describe('writers keep the JSON view they produced before', () => {
  // Expected values are written out by hand: the view must not depend on how it is stored.
  it('updatePageStateById', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    doc.transact(() =>
      updatePageStateById(doc, PAGE_ID, {
        [SHAPES]: edit('s3', { x: 999 }),
        layerOrder: ['s2', ...STATE.layerOrder.filter((id) => id !== 's2')],
        headline: 'Zwei',
      })
    );
    expect(readPages(doc)[0]!.state).toEqual({
      headline: 'Zwei',
      [SHAPES]: edit('s3', { x: 999 }),
      layerOrder: ['s2', ...STATE.layerOrder.filter((id) => id !== 's2')],
    });
  });

  it('replaceDeck: updated, inserted and removed pages', () => {
    const doc = v4Doc([page('p1', STATE), page('p2', { [SHAPES]: [shape('z', 1)] })]);
    doc.transact(() =>
      replaceDeck(
        doc,
        {
          updates: [{ pageId: 'p1', state: { [SHAPES]: [shape('n1', 7)], layerOrder: ['n1'] } }],
          inserts: [
            {
              afterPageId: 'p1',
              configId: 'fixture-poster',
              pageId: 'p3',
              state: { [SHAPES]: [shape('i', 2)] },
            },
          ],
          removes: ['p2'],
        },
        'deck-op'
      )
    );
    expect(serializeDeck(doc).map((p) => [p.id, p.state])).toEqual([
      ['p1', { [SHAPES]: [shape('n1', 7)], layerOrder: ['n1'] }],
      ['p3', { [SHAPES]: [shape('i', 2)] }],
    ]);
  });

  it('setPageConfigById', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    doc.transact(() =>
      setPageConfigById(doc, PAGE_ID, 'fixture-poster', {
        [SHAPES]: [shape('n1', 7)],
        layerOrder: ['n1'],
      })
    );
    expect(readPages(doc)[0]!.state).toEqual({ [SHAPES]: [shape('n1', 7)], layerOrder: ['n1'] });
  });

  it('duplicating a page', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    doc.transact(() => duplicatePageById(doc, PAGE_ID, 'copy'));
    expect(serializeDeck(doc).map((p) => p.state)).toEqual([STATE, STATE]);
  });

  it('restorePageStateKeys: restores listed keys, deletes the absent ones, skips touched ones', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    doc.transact(() =>
      updatePageStateById(doc, PAGE_ID, {
        [SHAPES]: edit('s3', { x: 999 }),
        layerOrder: ['s1'],
        headline: 'Zwei',
      })
    );
    doc.transact(() =>
      restorePageStateKeys(
        doc,
        PAGE_ID,
        { [SHAPES]: TEN, headline: 'Eins' },
        [SHAPES, 'layerOrder', 'headline'],
        (key) => key !== 'headline'
      )
    );
    expect(readPages(doc)[0]!.state).toEqual({ [SHAPES]: TEN, headline: 'Zwei' });
  });

  it('a new page', () => {
    const doc = v4Doc([page(PAGE_ID, STATE)]);
    doc.transact(() => appendPage(doc, page('p2', { [SHAPES]: [shape('a', 1)], headline: 'x' })));
    expect(readPages(doc)[1]!.state).toEqual({ [SHAPES]: [shape('a', 1)], headline: 'x' });
  });
});
