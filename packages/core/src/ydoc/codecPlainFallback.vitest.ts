// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A key the classes name that is written plain because its value cannot be a structure (review
 * of #211, finding 4, accepted): the write keeps storing it plain, and `onPlainFallback` reports
 * it once per state map and key, with the reason and whether a structure was replaced. The core
 * itself never logs.
 */
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  buildStateMap,
  liftDocumentState,
  readStateKey,
  stateKeyClasses,
  writeStateKeys,
  type PlainFallback,
} from './index.js';

const classes = stateKeyClasses();

function doc(version: number) {
  const d = new Y.Doc();
  d.getMap('meta').set('schemaVersion', version);
  const page = new Y.Map<unknown>();
  const stateY = new Y.Map<unknown>();
  page.set('state', stateY);
  d.getMap('pagesById').set('p', page);
  return { d, stateY };
}
const DUPLICATE = [
  { id: 'a', x: 1 },
  { id: 'a', x: 2 },
];

describe('a value a structure cannot hold', () => {
  it('replacing a structure: stored plain, reported once, with replaced: true', () => {
    const { stateY } = doc(4);
    const onPlainFallback = vi.fn<(f: PlainFallback) => void>();
    const options = { classes, lift: true, onPlainFallback };
    writeStateKeys(stateY, { shapeInstances: [{ id: 'a', x: 1 }] }, options);
    expect(stateY.get('shapeInstances')).toBeInstanceOf(Y.Map);
    writeStateKeys(stateY, { shapeInstances: DUPLICATE }, options);
    expect(stateY.get('shapeInstances')).toEqual(DUPLICATE);
    expect(onPlainFallback).toHaveBeenCalledTimes(1);
    expect(onPlainFallback).toHaveBeenCalledWith({
      key: 'shapeInstances',
      keyClass: 'elements',
      reason: "[1] repeats the id 'a'",
      replaced: true,
    });
    // Once per state map and key.
    writeStateKeys(stateY, { shapeInstances: [{ x: 1 }] }, options);
    expect(onPlainFallback).toHaveBeenCalledTimes(1);
    expect(readStateKey(stateY, 'shapeInstances')).toEqual([{ x: 1 }]);
  });

  it('into an absent or plain key under version 4: stored plain, reported with replaced: false', () => {
    const { stateY } = doc(4);
    const onPlainFallback = vi.fn<(f: PlainFallback) => void>();
    writeStateKeys(stateY, { layerOrder: ['x', 'x'] }, { classes, lift: true, onPlainFallback });
    expect(onPlainFallback).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'layerOrder', keyClass: 'order', replaced: false })
    );
  });

  it('is not reported in a document below version 4, where every key is plain by rule 1', () => {
    const { stateY } = doc(3);
    const onPlainFallback = vi.fn();
    writeStateKeys(stateY, { shapeInstances: DUPLICATE }, { classes, lift: true, onPlainFallback });
    expect(onPlainFallback).not.toHaveBeenCalled();
  });

  it('is reported by buildStateMap and by the lift', () => {
    const built = vi.fn();
    buildStateMap({ shapeInstances: DUPLICATE }, { classes, lift: true, onPlainFallback: built });
    expect(built).toHaveBeenCalledTimes(1);
    const { d, stateY } = doc(3);
    stateY.set('iconStates', { $reserved: 1 });
    const lifted = vi.fn();
    liftDocumentState(d, classes, { onPlainFallback: lifted });
    expect(lifted).toHaveBeenCalledWith({
      key: 'iconStates',
      keyClass: 'record',
      reason: "has the reserved key '$reserved'",
      replaced: false,
    });
  });

  it('without a hook, nothing is logged', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { stateY } = doc(4);
    writeStateKeys(stateY, { shapeInstances: DUPLICATE }, { classes, lift: true });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
