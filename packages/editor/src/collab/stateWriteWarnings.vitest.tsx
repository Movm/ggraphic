// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The editor reports a page-state key written plain because its value cannot be a structure
 * (review of #211, finding 4) to the host's `onStateWriteWarning` listeners, once per page and
 * key, and with `console.warn` while no listener is registered. The write itself is unchanged.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { stampYDocument } from './documentVersion.js';
import { readPages, seedPagesIfEmpty, updatePageStateById } from './pagesDoc.js';
import { onStateWriteWarning, type StateWriteWarning } from './stateWriteWarnings.js';
import { YDOC_KEYS } from './ydocKeys.js';

function v4Doc() {
  const doc = new Y.Doc();
  doc.transact(() => {
    stampYDocument(doc);
    seedPagesIfEmpty(doc, [
      { id: 'p1', configId: 'fixture-poster', state: { shapeInstances: [{ id: 'a', x: 1 }] } },
    ]);
  });
  return doc;
}
const DUPLICATE = [
  { id: 'a', x: 1 },
  { id: 'a', x: 2 },
];

let unsubscribe: (() => void) | null = null;
afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
  vi.restoreAllMocks();
});

describe('a classed key written plain', () => {
  it('reaches the host listener once, and the write is stored plain', () => {
    const seen: StateWriteWarning[] = [];
    unsubscribe = onStateWriteWarning((w) => seen.push(w));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = v4Doc();
    updatePageStateById(doc, 'p1', { shapeInstances: DUPLICATE });
    updatePageStateById(doc, 'p1', { shapeInstances: [...DUPLICATE, { id: 'b' }] });
    expect(seen).toEqual([
      {
        kind: 'plain-fallback',
        key: 'shapeInstances',
        keyClass: 'elements',
        reason: "[1] repeats the id 'a'",
        replaced: true,
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
    const stateY = readPages(doc)[0]!.yMap.get(YDOC_KEYS.state) as Y.Map<unknown>;
    expect(Array.isArray(stateY.get('shapeInstances'))).toBe(true);
  });

  it('goes to console.warn while no listener is registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    updatePageStateById(v4Doc(), 'p1', { shapeInstances: DUPLICATE });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("'shapeInstances' is stored as plain JSON");
  });
});
