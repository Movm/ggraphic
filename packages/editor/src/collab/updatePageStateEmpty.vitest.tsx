// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { stateMapOf, v4Doc } from './__tests__/elementStorageKit.js';
import { updatePageStateById } from './pagesDoc.js';

/**
 * #214: after an undo the canvas reports every collection, the ones the page never held as
 * empty values. Writing them would create ~15 empty structures per page, and an empty structure
 * can win the key against a peer's first element of that kind.
 */
const doc = () => v4Doc([{ id: 'p', configId: 'fixture-poster', state: { shapeInstances: [] } }]);

describe('updatePageStateById and empty values', () => {
  it('does not create a classed key the page never had for an empty collection, id list or record', () => {
    const d = doc();
    const before = Array.from(stateMapOf(d, 'p').keys()).sort();
    const sv = Y.encodeStateVector(d);
    updatePageStateById(d, 'p', {
      assetInstances: [],
      layerOrder: [],
      iconStates: {},
    });
    expect(Array.from(stateMapOf(d, 'p').keys()).sort()).toEqual(before);
    // Not a write in Yjs terms either: nothing to send to a peer.
    expect(Y.encodeStateVector(d)).toEqual(sv);
  });

  it('still writes an empty value over a key the page has, and a non-empty value to an absent one', () => {
    const d = doc();
    updatePageStateById(d, 'p', { shapeInstances: [{ id: 's1', x: 1 }], layerOrder: ['s1'] });
    updatePageStateById(d, 'p', { shapeInstances: [], layerOrder: [] });
    const state = stateMapOf(d, 'p');
    expect(state.get('shapeInstances')).toBeInstanceOf(Y.Map);
    expect(Object.keys((state.get('shapeInstances') as Y.Map<unknown>).toJSON())).toEqual([
      '$kind',
    ]);
    expect(state.has('layerOrder')).toBe(true);
  });

  it('writes an empty value of a key the classes do not name', () => {
    const d = doc();
    updatePageStateById(d, 'p', { groups: [] });
    expect(stateMapOf(d, 'p').get('groups')).toEqual([]);
  });
});
