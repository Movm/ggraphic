// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  STATE_KIND_KEY,
  buildStateMap,
  liftDocumentState,
  liftStateMap,
  readState,
  stateKeyClasses,
} from './index.js';

const classes = stateKeyClasses(['stampInstances']);

/** A version 3 page state: every key plain. */
const V3_STATE: Record<string, unknown> = {
  headline: 'Hallo',
  shapeInstances: [
    { id: 's1', x: 1, fill: '#000' },
    { id: 's2', x: 2 },
  ],
  additionalTexts: [{ id: 't1', text: 'A' }],
  stampInstances: [{ id: 'st1', label: 'host' }],
  layerOrder: ['s2', 't1', 's1'],
  lockedLayerIds: [],
  iconStates: { 'icon-a': { x: 1 } },
  templateRotations: { headline: 5 },
  groups: [{ id: 'g', elementIds: ['s1'] }],
  // Unrepresentable: stays plain on every lift.
  frameInstances: [{ id: 'f' }, { id: 'f' }],
  selectedIcons: 'not-a-list',
};

const LIFTABLE = [
  'shapeInstances',
  'additionalTexts',
  'stampInstances',
  'layerOrder',
  'lockedLayerIds',
  'iconStates',
  'templateRotations',
];

function v3Doc(pages = 2): Y.Doc {
  const doc = new Y.Doc();
  const pagesById = doc.getMap<Y.Map<unknown>>('pagesById');
  for (let i = 0; i < pages; i++) {
    const page = new Y.Map<unknown>();
    page.set('id', `p${i}`);
    page.set('state', buildStateMap(structuredClone(V3_STATE), { classes, lift: false }));
    pagesById.set(`p${i}`, page);
  }
  return doc;
}

const states = (doc: Y.Doc) =>
  Array.from(doc.getMap<Y.Map<unknown>>('pagesById').values()).map((page) =>
    readState(page.get('state') as Y.Map<unknown>)
  );

const stateOf = (doc: Y.Doc, id = 'p0') =>
  doc.getMap<Y.Map<unknown>>('pagesById').get(id)!.get('state') as Y.Map<unknown>;

describe('lift', () => {
  it('lifts every classed representable key and is the identity on the JSON view', () => {
    const doc = v3Doc();
    const before = states(doc);
    expect(liftDocumentState(doc, classes)).toBe(LIFTABLE.length * 2);
    expect(states(doc)).toStrictEqual(before);
    const stateY = stateOf(doc);
    for (const key of LIFTABLE) expect(stateY.get(key)).toBeInstanceOf(Y.Map);
    for (const key of ['headline', 'groups', 'frameInstances', 'selectedIcons']) {
      expect(stateY.get(key)).not.toBeInstanceOf(Y.Map);
    }
  });

  it('is idempotent: a second lift writes nothing', () => {
    const doc = v3Doc();
    liftDocumentState(doc, classes);
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));
    expect(liftDocumentState(doc, classes)).toBe(0);
    expect(liftStateMap(stateOf(doc), classes)).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('runs in one transaction', () => {
    const doc = v3Doc();
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    doc.transact(() => liftDocumentState(doc, classes), 'setup');
    expect(transactions).toBe(1);
  });

  it('lifts again a plain value written over a lifted key (data trigger)', () => {
    const doc = v3Doc(1);
    liftDocumentState(doc, classes);
    const stateY = stateOf(doc);
    stateY.set('shapeInstances', [{ id: 'old-writer' }]);
    expect(liftStateMap(stateY, classes)).toEqual(['shapeInstances']);
    expect(readState(stateY)['shapeInstances']).toStrictEqual([{ id: 'old-writer' }]);
  });

  it('leaves a key without a class alone, and a plain key the classes do not name', () => {
    const doc = v3Doc(1);
    expect(liftStateMap(stateOf(doc), stateKeyClasses()).sort()).toEqual(
      LIFTABLE.filter((key) => key !== 'stampInstances').sort()
    );
    expect(stateOf(doc).get('stampInstances')).not.toBeInstanceOf(Y.Map);
  });

  it('two docs lifting the same plain value at once converge', () => {
    const a = v3Doc();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const before = states(a);

    liftDocumentState(a, classes);
    liftDocumentState(b, classes);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    expect(states(a)).toStrictEqual(before);
    expect(states(b)).toStrictEqual(before);
    // The same structure won on both sides: equal content, and further edits diff into it.
    for (const key of LIFTABLE) {
      const ma = stateOf(a).get(key) as Y.Map<unknown>;
      const mb = stateOf(b).get(key) as Y.Map<unknown>;
      expect(ma.get(STATE_KIND_KEY)).toBe(mb.get(STATE_KIND_KEY));
      expect(ma.toJSON()).toStrictEqual(mb.toJSON());
    }
    expect(Y.encodeStateVector(a)).toStrictEqual(Y.encodeStateVector(b));
  });
});
