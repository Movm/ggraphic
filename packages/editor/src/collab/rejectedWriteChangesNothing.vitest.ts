// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A page-state write the codec rejects changes nothing in the document (review of #211,
 * findings 3 and 5): not the properties of an element written before the bad one, not the keys
 * `replacePageState` deletes, not the pages `replaceDeck` updates before a bad insert. Yjs has
 * no rollback, so a writer must refuse before its first change.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { stampYDocument } from './documentVersion.js';
import {
  appendPage,
  readPages,
  replaceDeck,
  replacePageState,
  seedPagesIfEmpty,
  serializeDeck,
  setPageConfigById,
  updatePageStateById,
} from './pagesDoc.js';

const SHAPES = 'shapeInstances';
const STATE = {
  headline: 'h',
  keep: 1,
  [SHAPES]: [
    { id: 'a', x: 1, y: 1 },
    { id: 'b', x: 2, y: 2 },
  ],
};

/** A version 4 document (structured) or a version 3 one (plain) with pages p1 and p2. */
function deck(version: 3 | 4) {
  const doc = new Y.Doc();
  doc.transact(() => {
    if (version === 4) stampYDocument(doc);
    else doc.getMap('meta').set('schemaVersion', 3);
    seedPagesIfEmpty(doc, [
      { id: 'p1', configId: 'fixture-poster', state: STATE },
      { id: 'p2', configId: 'fixture-poster', state: { headline: 'zwei' } },
    ]);
  });
  return doc;
}

/** Runs `write`, expects it to throw, and that the document is exactly as before. */
function expectNoChange(doc: Y.Doc, write: () => void) {
  const vector = Y.encodeStateVector(doc);
  const json = JSON.stringify(serializeDeck(doc));
  let updates = 0;
  const count = () => updates++;
  doc.on('update', count);
  expect(write).toThrow(/rejected|writeStateKeys|buildStateMap/);
  doc.off('update', count);
  expect(updates).toBe(0);
  expect(Y.encodeStateVector(doc)).toEqual(vector);
  expect(JSON.stringify(serializeDeck(doc))).toBe(json);
}

describe.each([4, 3] as const)('in a version %i document', (version) => {
  it('updatePageStateById with a function in an element', () => {
    const doc = deck(version);
    expectNoChange(doc, () =>
      doc.transact(() =>
        updatePageStateById(doc, 'p1', {
          [SHAPES]: [
            { id: 'a', y: 5, onClick: () => 1 },
            { id: 'b', x: 2, y: 2 },
          ],
        })
      )
    );
  });

  it('updatePageStateById with a Date, which Yjs would store as {}', () => {
    const doc = deck(version);
    expectNoChange(doc, () => updatePageStateById(doc, 'p1', { createdAt: new Date(0) }));
  });

  it('replacePageState: a rejected value keeps the keys it would have deleted', () => {
    const doc = deck(version);
    expectNoChange(doc, () =>
      doc.transact(() => replacePageState(doc, 'p1', { headline: 'new', big: 1n }))
    );
    expect(readPages(doc)[0]!.state['keep']).toBe(1);
  });

  it('replaceDeck: a bad insert leaves the updated and removed pages alone', () => {
    const doc = deck(version);
    expectNoChange(doc, () =>
      replaceDeck(
        doc,
        {
          updates: [{ pageId: 'p1', state: { headline: 'neu' } }],
          inserts: [
            {
              afterPageId: 'p1',
              configId: 'fixture-poster',
              state: { [SHAPES]: [{ id: 'c', at: new Map() }] },
            },
          ],
          removes: ['p2'],
        },
        'deck'
      )
    );
  });

  it('appendPage with a Set', () => {
    const doc = deck(version);
    expectNoChange(doc, () =>
      appendPage(doc, { id: 'p3', configId: 'fixture-poster', state: { tags: new Set(['a']) } })
    );
  });

  it('seedPagesIfEmpty: a bad second page seeds no page', () => {
    const doc = new Y.Doc();
    if (version === 4) stampYDocument(doc);
    expectNoChange(doc, () =>
      seedPagesIfEmpty(doc, [
        { id: 'p1', configId: 'fixture-poster', state: STATE },
        { id: 'p2', configId: 'fixture-poster', state: { at: new Date(0) } },
      ])
    );
  });

  it('setPageConfigById with a class instance', () => {
    const doc = deck(version);
    class Fill {
      color = 'red';
    }
    expectNoChange(doc, () =>
      setPageConfigById(doc, 'p1', 'fixture-poster', { [SHAPES]: [{ id: 'a', fill: new Fill() }] })
    );
  });
});
