// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  CORE_ELEMENT_COLLECTION_KEYS,
  ELEMENT_POS_KEY,
  ORDERED_ID_KEYS,
  RECORD_KEYS,
  STATE_KIND_KEY,
  buildStateMap,
  mayWriteStructured,
  readState,
  readStateKey,
  stateKeyClasses,
  writeStateKeys,
  type StateKeyClass,
} from './index.js';
import { sameStateValue } from './internal.js';

const HOST_KEY = 'stampInstances';
const classes = stateKeyClasses([HOST_KEY]);
const LIFT = { classes, lift: true };

/** One element list per built-in collection key and the made-up host kind. */
const COLLECTIONS: Record<string, Record<string, unknown>[]> = {
  shapeInstances: [
    { id: 'shape-1', shapeType: 'rect', x: 10, y: 20, fill: '#ff0000', rotation: 0 },
    { id: 'shape-2', shapeType: 'circle', x: 50, y: 60, fill: { type: 'linear', stops: [0, 1] } },
  ],
  frameInstances: [{ id: 'frame-1', x: 0, y: 0, crop: { x: 0.1, y: 0.2, width: 1, height: 1 } }],
  additionalTexts: [
    { id: 'text-1', text: 'Hello', runs: [{ text: 'He', bold: true }, { text: 'llo' }] },
    { id: 'text-2', text: 'World', fontSize: 32, align: undefined },
  ],
  illustrationInstances: [{ id: 'ill-1', src: 'tree', colors: ['#000', '#fff'] }],
  assetInstances: [{ id: 'asset-1', assetId: 'logo', x: 1.5, opacity: null }],
  circleBadgeInstances: [{ id: 'cb-1', text: '42', x: 3 }],
  pillBadgeInstances: [{ id: 'pb-1', text: 'Neu', filters: { blur: 2 } }],
  userImageInstances: [{ id: 'img-1', src: 'blob:x', crop: null, hidden: false }],
  chartInstances: [
    {
      id: 'chart-1',
      data: [
        [1, 2],
        [3, 4],
      ],
      kind: 'bar',
    },
  ],
  [HOST_KEY]: [
    { id: 'stamp-1', label: 'A' },
    { id: 'stamp-2', label: 'B' },
  ],
};

const ORDERS: Record<string, string[]> = {
  layerOrder: ['shape-2', 'text-1', 'shape-1', 'background'],
  selectedIcons: ['icon-b', 'icon-a', 'icon-c'],
  lockedLayerIds: ['shape-1'],
};

const RECORDS: Record<string, Record<string, unknown>> = {
  iconStates: { 'icon-a': { x: 1, y: 2, color: '#000' }, 'icon-b': { x: 3, y: 4 } },
  templateRotations: { headline: 15, subline: -3.5 },
  templateTextAligns: { headline: 'left', subline: 'center' },
};

const PLAIN: Record<string, unknown> = {
  headline: 'Hallo',
  fontSize: 42,
  backgroundImageAdjustments: { brightness: 1.1 },
  backgroundImageRotation: 90,
  groups: [{ id: 'g1', elementIds: ['shape-1', 'shape-2'] }],
  bind: { headline: { ref: 'brand.name', value: 'X' } },
  templateRef: { id: 't', version: 1 },
  empty: null,
};

const SAMPLE: Record<string, unknown> = { ...PLAIN, ...COLLECTIONS, ...ORDERS, ...RECORDS };

/**
 * A version 4 doc (stamped, so structured writes are allowed) with one page whose state map is
 * built from `state`; `lift: false` keeps every key plain, as a document lifted only in part.
 */
function pageWith(state: Record<string, unknown>, lift = true) {
  const doc = new Y.Doc();
  doc.getMap('meta').set('schemaVersion', 4);
  const page = new Y.Map<unknown>();
  page.set('state', buildStateMap(state, { classes, lift }));
  doc.getMap<Y.Map<unknown>>('pagesById').set('p1', page);
  const stateY = doc.getMap<Y.Map<unknown>>('pagesById').get('p1')!.get('state') as Y.Map<unknown>;
  return { doc, stateY };
}

const classOf = (stateY: Y.Map<unknown>, key: string): unknown => {
  const value = stateY.get(key);
  return value instanceof Y.Map ? value.get(STATE_KIND_KEY) : 'plain';
};

/**
 * Every write a callback makes to the state map, as paths: `key` for a whole key,
 * `key/id` for an element, id or record entry, `key/id/prop` for one property.
 */
function writesOf(stateY: Y.Map<unknown>, write: () => void): string[] {
  const paths: string[] = [];
  const observer = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    for (const event of events) {
      for (const key of event.changes.keys.keys()) paths.push([...event.path, key].join('/'));
    }
  };
  stateY.observeDeep(observer);
  write();
  stateY.unobserveDeep(observer);
  return paths.sort();
}

function updatesOf(doc: Y.Doc, write: () => void): Uint8Array[] {
  const updates: Uint8Array[] = [];
  const listen = (update: Uint8Array) => updates.push(update);
  doc.on('update', listen);
  write();
  doc.off('update', listen);
  return updates;
}

describe('round trip', () => {
  it('reads back exactly what buildStateMap stored, key by key', () => {
    const { stateY } = pageWith(SAMPLE);
    expect(readState(stateY)).toStrictEqual(SAMPLE);
  });

  it.each([
    ...[...CORE_ELEMENT_COLLECTION_KEYS, HOST_KEY].map((key) => [key, 'elements'] as const),
    ...ORDERED_ID_KEYS.map((key) => [key, 'order'] as const),
    ...RECORD_KEYS.map((key) => [key, 'record'] as const),
  ])('%s is stored as %s and reads back equal', (key, cls: StateKeyClass) => {
    const { stateY } = pageWith(SAMPLE);
    expect(classOf(stateY, key)).toBe(cls);
    expect(readStateKey(stateY, key)).toStrictEqual(SAMPLE[key]);
  });

  it('keeps every other key plain, as the very value', () => {
    const { stateY } = pageWith(SAMPLE);
    for (const key of Object.keys(PLAIN)) {
      expect(classOf(stateY, key)).toBe('plain');
      expect(readStateKey(stateY, key)).toStrictEqual(PLAIN[key]);
    }
  });

  it('reads back what writeStateKeys wrote into an empty state, through an update', () => {
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 4);
    doc.getMap('pagesById').set('p1', new Y.Map());
    const page = doc.getMap<Y.Map<unknown>>('pagesById').get('p1')!;
    page.set('state', new Y.Map());
    const stateY = page.get('state') as Y.Map<unknown>;
    writeStateKeys(stateY, SAMPLE, LIFT);
    expect(classOf(stateY, 'shapeInstances')).toBe('elements');

    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    const copyState = copy
      .getMap<Y.Map<unknown>>('pagesById')
      .get('p1')!
      .get('state') as Y.Map<unknown>;
    expect(readState(copyState)).toStrictEqual(SAMPLE);
  });

  it('round-trips the empty collection, id list and record', () => {
    const state = { shapeInstances: [], layerOrder: [], iconStates: {} };
    const { stateY } = pageWith(state);
    expect(classOf(stateY, 'shapeInstances')).toBe('elements');
    expect(classOf(stateY, 'layerOrder')).toBe('order');
    expect(classOf(stateY, 'iconStates')).toBe('record');
    expect(readState(stateY)).toStrictEqual(state);
  });

  it('puts id first and strips $pos from an element', () => {
    const { stateY } = pageWith({ shapeInstances: [{ x: 1, id: 's1' }] });
    const [element] = readStateKey(stateY, 'shapeInstances') as Record<string, unknown>[];
    expect(Object.keys(element!)).toEqual(['id', 'x']);
    const elementMap = (stateY.get('shapeInstances') as Y.Map<Y.Map<unknown>>).get('s1')!;
    expect(elementMap.has('id')).toBe(false);
    expect(typeof elementMap.get(ELEMENT_POS_KEY)).toBe('string');
  });
});

describe('the old (plain) shape and mixed documents', () => {
  it('reads a plain state as it is, by reference', () => {
    const { stateY } = pageWith(SAMPLE, false);
    for (const key of Object.keys(SAMPLE)) {
      expect(classOf(stateY, key)).toBe('plain');
      expect(readStateKey(stateY, key)).toBe(stateY.get(key));
    }
    expect(readState(stateY)).toStrictEqual(SAMPLE);
  });

  it('reads a document with some keys structured and some plain', () => {
    const { stateY } = pageWith(SAMPLE, false);
    writeStateKeys(stateY, { shapeInstances: [], layerOrder: [] }, LIFT);
    writeStateKeys(
      stateY,
      { shapeInstances: COLLECTIONS['shapeInstances'], layerOrder: ORDERS['layerOrder'] },
      LIFT
    );
    expect(classOf(stateY, 'shapeInstances')).toBe('elements');
    expect(classOf(stateY, 'frameInstances')).toBe('plain');
    expect(readState(stateY)).toStrictEqual(SAMPLE);
  });

  it('keeps a present undefined as present', () => {
    const { stateY } = pageWith({ headline: undefined });
    expect(Object.hasOwn(readState(stateY), 'headline')).toBe(true);
  });
});

describe('values the structure cannot represent stay plain', () => {
  const CASES: [string, string, unknown][] = [
    ['duplicate element ids', 'shapeInstances', [{ id: 'a' }, { id: 'a', x: 1 }]],
    ['an element id starting with $', 'shapeInstances', [{ id: '$a' }]],
    ['an element without a string id', 'shapeInstances', [{ id: 7 }]],
    ['an element that is no object', 'shapeInstances', ['a']],
    ['an element with a $pos property', 'shapeInstances', [{ id: 'a', $pos: 'V' }]],
    ['a collection that is no array', 'shapeInstances', { a: { id: 'a' } }],
    ['a collection that is a string', 'additionalTexts', 'oops'],
    ['duplicate ids in an order', 'layerOrder', ['a', 'b', 'a']],
    ['an id starting with $ in an order', 'lockedLayerIds', ['$a']],
    ['a non-string id in an order', 'selectedIcons', ['a', 1]],
    ['an order that is no array', 'layerOrder', 'a,b'],
    ['a record key starting with $', 'iconStates', { $a: { x: 1 } }],
    ['a record that is an array', 'templateRotations', [15]],
    ['a record that is null', 'templateTextAligns', null],
    ['undefined under a classed key', 'chartInstances', undefined],
  ];

  it.each(CASES)('%s', (_name, key, value) => {
    const state = { [key]: value };
    const built = pageWith(state);
    expect(classOf(built.stateY, key)).toBe('plain');
    expect(readStateKey(built.stateY, key)).toBe(value);

    // Written over an existing structure, the value replaces it plain.
    const { doc, stateY } = pageWith({ [key]: classes.get(key) === 'record' ? {} : [] });
    expect(classOf(stateY, key)).toBe(classes.get(key));
    writeStateKeys(stateY, state, LIFT);
    expect(classOf(stateY, key)).toBe('plain');
    expect(readStateKey(stateY, key)).toStrictEqual(value);
    // And it reads back identically on a peer.
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    const copyState = copy.getMap<Y.Map<unknown>>('pagesById').get('p1')!.get('state');
    expect(readStateKey(copyState as Y.Map<unknown>, key)).toStrictEqual(value);
  });
});

describe('Yjs values no writer creates', () => {
  it('reads a structure of an unknown class as absent and refuses to write over it', () => {
    const { doc, stateY } = pageWith({ headline: 'x' });
    const future = new Y.Map<unknown>();
    future.set(STATE_KIND_KEY, 'tree');
    future.set('a', 1);
    stateY.set('shapeInstances', future);
    expect(readStateKey(stateY, 'shapeInstances')).toBeUndefined();
    expect(Object.hasOwn(readState(stateY), 'shapeInstances')).toBe(false);

    const updates = updatesOf(doc, () =>
      expect(() => writeStateKeys(stateY, { headline: 'y', shapeInstances: [] }, LIFT)).toThrow(
        /class this build lacks/
      )
    );
    expect(updates).toEqual([]);
    expect(readStateKey(stateY, 'headline')).toBe('x');
  });

  it('reads a Y.Map without $kind and other Yjs types as their toJSON()', () => {
    const { stateY } = pageWith({});
    const map = new Y.Map<unknown>();
    map.set('a', 1);
    stateY.set('loose', map);
    const array = new Y.Array<unknown>();
    array.push([1, 2]);
    stateY.set('list', array);
    expect(readStateKey(stateY, 'loose')).toEqual({ a: 1 });
    expect(readStateKey(stateY, 'list')).toEqual([1, 2]);
  });

  it('refuses to write into a map that is not part of a document', () => {
    expect(() => writeStateKeys(new Y.Map(), { a: 1 }, LIFT)).toThrow(/buildStateMap/);
  });
});

describe('writeStateKeys writes only what changed', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, x: i, y: i, fill: '#000' }));

  it('one property of one element: one entry', () => {
    const { doc, stateY } = pageWith({ shapeInstances: many });
    const next = many.map((s) => (s.id === 's7' ? { ...s, x: 999 } : s));
    let updates: Uint8Array[] = [];
    const writes = writesOf(stateY, () => {
      updates = updatesOf(doc, () => writeStateKeys(stateY, { shapeInstances: next }, LIFT));
    });
    expect(writes).toEqual(['shapeInstances/s7/x']);
    expect(updates).toHaveLength(1);
    // A whole array of 50 shapes is well over a kilobyte; one property is a few bytes.
    expect(updates[0]!.byteLength).toBeLessThan(40);
    expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual(next);
  });

  it('red probe: a writer that stores the whole array fails the same assertion', () => {
    const { stateY } = pageWith({ shapeInstances: many }, false);
    const next = many.map((s) => (s.id === 's7' ? { ...s, x: 999 } : s));
    const writes = writesOf(stateY, () => stateY.set('shapeInstances', next));
    expect(writes).not.toEqual(['shapeInstances/s7/x']);
    expect(writes).toEqual(['shapeInstances']);
  });

  it('an equal value writes nothing, structured or plain', () => {
    const { doc, stateY } = pageWith(SAMPLE);
    const updates = updatesOf(doc, () => writeStateKeys(stateY, structuredClone(SAMPLE), LIFT));
    expect(updates).toEqual([]);
  });

  it('a property added and one removed', () => {
    const { stateY } = pageWith({ shapeInstances: many });
    const next = many.map((s) => {
      if (s.id !== 's3') return s;
      const { fill: _fill, ...rest } = s;
      return { ...rest, stroke: '#fff' };
    });
    expect(writesOf(stateY, () => writeStateKeys(stateY, { shapeInstances: next }, LIFT))).toEqual([
      'shapeInstances/s3/fill',
      'shapeInstances/s3/stroke',
    ]);
    expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual(next);
  });

  it('a move writes one $pos', () => {
    const { stateY } = pageWith({ shapeInstances: many });
    const next = [...many.slice(0, 3), ...many.slice(4), many[3]!];
    expect(writesOf(stateY, () => writeStateKeys(stateY, { shapeInstances: next }, LIFT))).toEqual([
      `shapeInstances/s3/${ELEMENT_POS_KEY}`,
    ]);
    expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual(next);
  });

  it('an insert writes one element, a delete removes one', () => {
    const { stateY } = pageWith({ shapeInstances: many });
    const added = { id: 'new', x: 5 };
    const inserted = [...many.slice(0, 10), added, ...many.slice(10)];
    expect(
      writesOf(stateY, () => writeStateKeys(stateY, { shapeInstances: inserted }, LIFT))
    ).toEqual(['shapeInstances/new']);
    expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual(inserted);

    const removed = inserted.filter((s) => s.id !== 's20');
    expect(
      writesOf(stateY, () => writeStateKeys(stateY, { shapeInstances: removed }, LIFT))
    ).toEqual(['shapeInstances/s20']);
    expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual(removed);
  });

  it('an order move writes one id, a record change one entry, a plain key the key', () => {
    const { stateY } = pageWith(SAMPLE);
    const layerOrder = ['text-1', 'shape-1', 'background', 'shape-2'];
    const iconStates = { ...RECORDS['iconStates'], 'icon-b': { x: 9, y: 4 } };
    expect(
      writesOf(stateY, () =>
        writeStateKeys(stateY, { layerOrder, iconStates, headline: 'Neu' }, LIFT)
      )
    ).toEqual(['headline', 'iconStates/icon-b', 'layerOrder/shape-2']);
    expect(readStateKey(stateY, 'layerOrder')).toStrictEqual(layerOrder);
    expect(readStateKey(stateY, 'iconStates')).toStrictEqual(iconStates);
  });

  it('keeps the order through many moves, inserts and deletes', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    let list = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, v: i }));
    let ids = list.map((e) => e.id);
    const { doc, stateY } = pageWith({ shapeInstances: list, layerOrder: ids });
    let next = 100;
    for (let step = 0; step < 300; step++) {
      const op = random();
      list = [...list];
      if (op < 0.4 && list.length > 1) {
        const [moved] = list.splice(Math.floor(random() * list.length), 1);
        list.splice(Math.floor(random() * (list.length + 1)), 0, moved!);
      } else if (op < 0.7 || list.length < 2) {
        list.splice(Math.floor(random() * (list.length + 1)), 0, { id: `e${next}`, v: next++ });
      } else {
        list.splice(Math.floor(random() * list.length), 1);
      }
      ids = list.map((e) => e.id);
      doc.transact(() => writeStateKeys(stateY, { shapeInstances: list, layerOrder: ids }, LIFT));
      expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual(list);
      expect(readStateKey(stateY, 'layerOrder')).toStrictEqual(ids);
    }
  });

  it('re-spaces a list whose neighbours tie before inserting between them', () => {
    const { stateY } = pageWith({ shapeInstances: [{ id: 'a' }, { id: 'b' }] });
    const map = stateY.get('shapeInstances') as Y.Map<Y.Map<unknown>>;
    map.get('b')!.set(ELEMENT_POS_KEY, map.get('a')!.get(ELEMENT_POS_KEY));
    expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual([{ id: 'a' }, { id: 'b' }]);
    const next = [{ id: 'a' }, { id: 'c' }, { id: 'b' }];
    writeStateKeys(stateY, { shapeInstances: next }, LIFT);
    expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual(next);
    const keys = ['a', 'c', 'b'].map((id) => map.get(id)!.get(ELEMENT_POS_KEY) as string);
    expect(new Set(keys).size).toBe(3);
  });
});

describe('the lift option (rule 1)', () => {
  it('writes an absent classed key plain without lift and structured with it', () => {
    const plain = pageWith({});
    writeStateKeys(plain.stateY, { shapeInstances: [{ id: 'a' }] }, { classes, lift: false });
    expect(classOf(plain.stateY, 'shapeInstances')).toBe('plain');

    const lifted = pageWith({});
    writeStateKeys(lifted.stateY, { shapeInstances: [{ id: 'a' }] }, LIFT);
    expect(classOf(lifted.stateY, 'shapeInstances')).toBe('elements');
  });

  it('lifts a changed plain value on write, and leaves an equal one alone', () => {
    const { doc, stateY } = pageWith({ layerOrder: ['a', 'b'] }, false);
    expect(updatesOf(doc, () => writeStateKeys(stateY, { layerOrder: ['a', 'b'] }, LIFT))).toEqual(
      []
    );
    writeStateKeys(stateY, { layerOrder: ['b', 'a'] }, LIFT);
    expect(classOf(stateY, 'layerOrder')).toBe('order');
    expect(readStateKey(stateY, 'layerOrder')).toEqual(['b', 'a']);
  });

  it('without lift, still diffs into a key that is structured already', () => {
    const { stateY } = pageWith({ shapeInstances: [{ id: 'a', x: 1 }] });
    expect(
      writesOf(stateY, () =>
        writeStateKeys(stateY, { shapeInstances: [{ id: 'a', x: 2 }] }, { classes, lift: false })
      )
    ).toEqual(['shapeInstances/a/x']);
  });

  it('follows the marker, not the classes: an unclassed structured key is diffed', () => {
    const { stateY } = pageWith({ shapeInstances: [{ id: 'a', x: 1 }] });
    const none = { classes: stateKeyClasses(), lift: false };
    writeStateKeys(stateY, { shapeInstances: [{ id: 'a', x: 3 }] }, { ...none });
    expect(classOf(stateY, 'shapeInstances')).toBe('elements');
  });

  it('mayWriteStructured reads meta.schemaVersion', () => {
    const doc = new Y.Doc();
    expect(mayWriteStructured(doc)).toBe(false);
    const meta = doc.getMap('meta');
    meta.set('schemaVersion', 3);
    expect(mayWriteStructured(doc)).toBe(false);
    meta.set('schemaVersion', '4');
    expect(mayWriteStructured(doc)).toBe(false);
    meta.set('schemaVersion', 4.5);
    expect(mayWriteStructured(doc)).toBe(false);
    meta.set('schemaVersion', 4);
    expect(mayWriteStructured(doc)).toBe(true);
    meta.set('schemaVersion', 5);
    expect(mayWriteStructured(doc)).toBe(true);
  });
});

describe('stateKeyClasses', () => {
  it('classes the host collection keys as elements and refuses a core id list or record', () => {
    expect(classes.get(HOST_KEY)).toBe('elements');
    expect(stateKeyClasses().has(HOST_KEY)).toBe(false);
    expect(() => stateKeyClasses(['layerOrder'])).toThrow();
    expect(() => stateKeyClasses(['iconStates'])).toThrow();
    expect(stateKeyClasses(['shapeInstances']).get('shapeInstances')).toBe('elements');
  });
});

describe('sameStateValue', () => {
  it('ignores object key order and undefined members, not array order', () => {
    expect(sameStateValue({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(sameStateValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameStateValue([1, 2], [2, 1])).toBe(false);
    expect(sameStateValue(null, undefined)).toBe(false);
  });
});

describe('read memo', () => {
  const shapes = [
    { id: 'a', x: 1 },
    { id: 'b', x: 2 },
  ];

  it('returns the same reference until the map changes', () => {
    const { stateY } = pageWith({ shapeInstances: shapes, layerOrder: ['a', 'b'] });
    const first = readStateKey(stateY, 'shapeInstances');
    expect(readStateKey(stateY, 'shapeInstances')).toBe(first);
    expect(readState(stateY)['shapeInstances']).toBe(first);
    expect(readStateKey(stateY, 'layerOrder')).toBe(readStateKey(stateY, 'layerOrder'));
  });

  it('is not stale after a change, and shares what did not change', () => {
    const { stateY } = pageWith({ shapeInstances: shapes, layerOrder: ['a', 'b'] });
    const before = readStateKey(stateY, 'shapeInstances') as Record<string, unknown>[];
    const order = readStateKey(stateY, 'layerOrder');
    writeStateKeys(stateY, { shapeInstances: [shapes[0], { id: 'b', x: 5 }] }, LIFT);
    const after = readStateKey(stateY, 'shapeInstances') as Record<string, unknown>[];
    expect(after).not.toBe(before);
    expect(after).toStrictEqual([
      { id: 'a', x: 1 },
      { id: 'b', x: 5 },
    ]);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(readStateKey(stateY, 'layerOrder')).toBe(order);
  });

  it('is fresh for observers, inside a transaction and after a remote update', () => {
    const { doc, stateY } = pageWith({ shapeInstances: shapes });
    readStateKey(stateY, 'shapeInstances');
    let seen: unknown;
    stateY.observeDeep(() => {
      seen = readStateKey(stateY, 'shapeInstances');
    });
    doc.transact(() => {
      writeStateKeys(stateY, { shapeInstances: [{ id: 'a', x: 7 }] }, LIFT);
      expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual([{ id: 'a', x: 7 }]);
      writeStateKeys(stateY, { shapeInstances: [{ id: 'a', x: 8 }] }, LIFT);
      expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual([{ id: 'a', x: 8 }]);
    });
    expect(seen).toStrictEqual([{ id: 'a', x: 8 }]);
    expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual([{ id: 'a', x: 8 }]);

    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    const peerState = peer
      .getMap<Y.Map<unknown>>('pagesById')
      .get('p1')!
      .get('state') as Y.Map<unknown>;
    const cached = readStateKey(peerState, 'shapeInstances');
    writeStateKeys(stateY, { shapeInstances: [{ id: 'a', x: 9 }] }, LIFT);
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc, Y.encodeStateVector(peer)));
    expect(readStateKey(peerState, 'shapeInstances')).not.toBe(cached);
    expect(readStateKey(peerState, 'shapeInstances')).toStrictEqual([{ id: 'a', x: 9 }]);
  });
});

describe('read memo: never served while a write it has not seen exists', () => {
  const shapes = [{ id: 'a', x: 1 }];

  it('a write from an observer is seen by a read in that observer and in afterTransaction', () => {
    const { doc, stateY } = pageWith({ shapeInstances: shapes });
    readStateKey(stateY, 'shapeInstances');
    let inObserver: unknown;
    let inAfter: unknown;
    const other = doc.getMap('other');
    other.observe(() => {
      writeStateKeys(stateY, { shapeInstances: [{ id: 'a', x: 2 }] }, LIFT);
      inObserver = readStateKey(stateY, 'shapeInstances');
    });
    doc.on('afterTransaction', (transaction: Y.Transaction) => {
      if ([...transaction.changed.keys()].includes(other as never))
        inAfter = readStateKey(stateY, 'shapeInstances');
    });
    other.set('k', 1);
    expect(inObserver).toStrictEqual([{ id: 'a', x: 2 }]);
    expect(inAfter).toStrictEqual([{ id: 'a', x: 2 }]);
    expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual([{ id: 'a', x: 2 }]);
  });

  it('a second observer of the same transaction sees what the first one wrote', () => {
    const { doc, stateY } = pageWith({ layerOrder: ['a', 'b'] });
    readStateKey(stateY, 'layerOrder');
    let seen: unknown;
    doc.getMap('one').observe(() => writeStateKeys(stateY, { layerOrder: ['b', 'a'] }, LIFT));
    doc.getMap('two').observe(() => {
      seen = readStateKey(stateY, 'layerOrder');
    });
    doc.transact(() => {
      doc.getMap('one').set('k', 1);
      doc.getMap('two').set('k', 1);
    });
    expect(seen).toStrictEqual(['b', 'a']);
  });

  it('a write from an update handler is seen right after it', () => {
    const { doc, stateY } = pageWith({ layerOrder: ['a', 'b'] });
    readStateKey(stateY, 'layerOrder');
    let seen: unknown;
    const once = () => {
      doc.off('update', once);
      writeStateKeys(stateY, { layerOrder: ['b', 'a'] }, LIFT);
      seen = readStateKey(stateY, 'layerOrder');
    };
    doc.on('update', once);
    doc.getMap('other').set('k', 1);
    expect(seen).toStrictEqual(['b', 'a']);
  });

  it('a beforeObserverCalls listener registered before the codec reads fresh', () => {
    const { doc, stateY } = pageWith({ layerOrder: ['a', 'b'] });
    let seen: unknown;
    doc.on('beforeObserverCalls', () => {
      seen = readStateKey(stateY, 'layerOrder');
    });
    readStateKey(stateY, 'layerOrder'); // registers the codec's listener after this one
    writeStateKeys(stateY, { layerOrder: ['b', 'a'] }, LIFT);
    expect(seen).toStrictEqual(['b', 'a']);
  });

  it('a destroyed doc is read fresh', () => {
    const { doc, stateY } = pageWith({ layerOrder: ['a', 'b'] });
    readStateKey(stateY, 'layerOrder');
    doc.destroy();
    writeStateKeys(stateY, { layerOrder: ['b', 'a'] }, LIFT);
    expect(readStateKey(stateY, 'layerOrder')).toStrictEqual(['b', 'a']);
  });

  it('still shares structure for reads in an observer of a plain transaction', () => {
    const { stateY } = pageWith({ shapeInstances: [...shapes, { id: 'b', x: 2 }] });
    const before = readStateKey(stateY, 'shapeInstances') as unknown[];
    let after: unknown[] = [];
    stateY.observeDeep(() => {
      after = readStateKey(stateY, 'shapeInstances') as unknown[];
    });
    writeStateKeys(stateY, { shapeInstances: [shapes[0], { id: 'b', x: 3 }] }, LIFT);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toStrictEqual({ id: 'b', x: 3 });
  });
});

describe('a rejected write changes nothing', () => {
  const cyclic: Record<string, unknown> = { id: 'b' };
  cyclic['self'] = cyclic;

  it.each([
    ['a BigInt', [{ id: 'b', x: 10n }]],
    ['a cycle', [cyclic]],
    ['a Yjs value', new Y.Map()],
  ])('%s anywhere in partial', (_name, bad) => {
    const before = {
      headline: 'old',
      shapeInstances: [
        { id: 'a', x: 1 },
        { id: 'b', x: 1 },
      ],
    };
    const { doc, stateY } = pageWith(before);
    const updates = updatesOf(doc, () =>
      expect(() => writeStateKeys(stateY, { headline: 'new', shapeInstances: bad }, LIFT)).toThrow(
        /writeStateKeys: 'shapeInstances'/
      )
    );
    expect(updates).toEqual([]);
    expect(readState(stateY)).toStrictEqual(before);
  });

  it('a stored value that is not JSON is replaced instead of throwing midway', () => {
    const { stateY } = pageWith({ shapeInstances: [{ id: 'a', x: 1 }] });
    (stateY.get('shapeInstances') as Y.Map<Y.Map<unknown>>).get('a')!.set('x', 10n);
    writeStateKeys(stateY, { headline: 'new', shapeInstances: [{ id: 'a', x: 2 }] }, LIFT);
    expect(readState(stateY)).toStrictEqual({
      headline: 'new',
      shapeInstances: [{ id: 'a', x: 2 }],
    });
  });
});

describe('stored order keys the codec never mints', () => {
  it.each([
    ['ending in the smallest digit', { a: '0', b: 'V' }, ['n', 'a', 'b']],
    ['ending in the smallest digit, as the upper bound', { a: 'A', b: 'A0' }, ['a', 'n', 'b']],
    ['outside the alphabet', { a: '-', b: '.' }, ['a', 'n', 'b']],
    ['empty', { a: '', b: 'V' }, ['n', 'a', 'b']],
  ])('%s: the id gets a fresh key and the order holds', (_name, keys, next) => {
    const { stateY } = pageWith({ layerOrder: ['a', 'b'] });
    const map = stateY.get('layerOrder') as Y.Map<unknown>;
    for (const [id, key] of Object.entries(keys)) map.set(id, key);
    expect(readStateKey(stateY, 'layerOrder')).toStrictEqual(['a', 'b']);
    writeStateKeys(stateY, { layerOrder: next }, LIFT);
    expect(readStateKey(stateY, 'layerOrder')).toStrictEqual(next);
  });

  it('the same for an element $pos', () => {
    const { stateY } = pageWith({ shapeInstances: [{ id: 'a' }, { id: 'b' }] });
    const map = stateY.get('shapeInstances') as Y.Map<Y.Map<unknown>>;
    map.get('a')!.set(ELEMENT_POS_KEY, '0');
    map.get('b')!.set(ELEMENT_POS_KEY, 'V');
    const next = [{ id: 'n' }, { id: 'a' }, { id: 'b' }];
    writeStateKeys(stateY, { shapeInstances: next }, LIFT);
    expect(readStateKey(stateY, 'shapeInstances')).toStrictEqual(next);
  });
});

describe('property and key names of any kind survive', () => {
  const NAMES = ['__proto__', 'constructor', 'hasOwnProperty', 'toString', ''];

  it.each(NAMES)('%j as an element property, a record key, an id and a state key', (name) => {
    const own = (pairs: [string, unknown][]) =>
      Object.fromEntries(pairs) as Record<string, unknown>;
    const state = own([
      [
        'shapeInstances',
        [
          own([
            ['id', 'a'],
            [name, { x: 1 }],
          ]),
          { id: name || 'empty', x: 2 },
        ],
      ],
      [
        'iconStates',
        own([
          [name, { x: 1 }],
          ['b', 2],
        ]),
      ],
      ['layerOrder', [name || 'empty', 'a']],
      [name || 'emptyKey', 'plain'],
    ]);
    const { doc, stateY } = pageWith(state);
    expect(readState(stateY)).toStrictEqual(state);
    const element = (readStateKey(stateY, 'shapeInstances') as Record<string, unknown>[])[0]!;
    expect(Object.hasOwn(element, name)).toBe(true);

    // Writing back what was read changes nothing.
    const updates = updatesOf(doc, () => writeStateKeys(stateY, readState(stateY), LIFT));
    expect(updates).toEqual([]);
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    const peerState = peer.getMap<Y.Map<unknown>>('pagesById').get('p1')!.get('state');
    const onPeer = readState(peerState as Y.Map<unknown>);
    // Not toStrictEqual: it compares `.constructor` by reference, and an own `constructor`
    // property decoded on the peer is an equal but different object.
    expect(sameStateValue(onPeer, state)).toBe(true);
    const peerElement = (onPeer['shapeInstances'] as Record<string, unknown>[])[0]!;
    expect(Object.hasOwn(peerElement, name)).toBe(true);
    expect(Object.hasOwn(onPeer['iconStates'] as object, name)).toBe(true);
  });
});

describe('re-spacing', () => {
  /** A layerOrder whose `a` and `b` tie, on two synced docs. */
  function tiedPair() {
    const { doc: a, stateY: sa } = pageWith({ layerOrder: ['a', 'b', 'c'] });
    const map = sa.get('layerOrder') as Y.Map<unknown>;
    map.set('b', map.get('a'));
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const sb = b.getMap<Y.Map<unknown>>('pagesById').get('p1')!.get('state') as Y.Map<unknown>;
    return { a, sa, b, sb };
  }

  it('jitters the keys it mints, so two concurrent re-spaces do not tie again', () => {
    for (let run = 0; run < 20; run++) {
      const { a, sa, b, sb } = tiedPair();
      writeStateKeys(sa, { layerOrder: ['a', 'n', 'b', 'c'] }, LIFT);
      writeStateKeys(sb, { layerOrder: ['c', 'a', 'm', 'b'] }, LIFT);
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
      expect(readStateKey(sa, 'layerOrder')).toStrictEqual(readStateKey(sb, 'layerOrder'));
      const keys = Object.entries((sa.get('layerOrder') as Y.Map<unknown>).toJSON()).filter(
        ([id]) => id !== STATE_KIND_KEY
      );
      expect(new Set(keys.map(([, key]) => key)).size).toBe(keys.length);
    }
  });
});

describe('rule 1, enforced by writeStateKeys', () => {
  it('writes plain in a document below version 4, whatever lift says', () => {
    for (const version of [undefined, 3]) {
      const doc = new Y.Doc();
      if (version !== undefined) doc.getMap('meta').set('schemaVersion', version);
      doc.getMap<Y.Map<unknown>>('pagesById').set('p', new Y.Map());
      const page = doc.getMap<Y.Map<unknown>>('pagesById').get('p')!;
      page.set('state', new Y.Map());
      const stateY = page.get('state') as Y.Map<unknown>;
      writeStateKeys(stateY, { shapeInstances: [{ id: 'a' }], layerOrder: ['a'] }, LIFT);
      expect(classOf(stateY, 'shapeInstances')).toBe('plain');
      expect(classOf(stateY, 'layerOrder')).toBe('plain');
    }
  });

  it('writes structure when the same transaction stamps 4 first', () => {
    const doc = new Y.Doc();
    doc.getMap('meta').set('schemaVersion', 3);
    doc.getMap<Y.Map<unknown>>('pagesById').set('p', new Y.Map());
    const page = doc.getMap<Y.Map<unknown>>('pagesById').get('p')!;
    page.set('state', new Y.Map());
    const stateY = page.get('state') as Y.Map<unknown>;
    doc.transact(() => {
      doc.getMap('meta').set('schemaVersion', 4);
      writeStateKeys(stateY, { shapeInstances: [{ id: 'a' }] }, LIFT);
    });
    expect(classOf(stateY, 'shapeInstances')).toBe('elements');
  });
});
