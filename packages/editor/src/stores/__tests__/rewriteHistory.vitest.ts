// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { createCanvasEditorStore } from '../createCanvasEditorStore.js';

function storeWith(...values: number[]) {
  const store = createCanvasEditorStore();
  for (const v of values) store.getState().saveToHistory({ v });
  return store;
}

const entries = (store: ReturnType<typeof storeWith>) =>
  store.getState().history.map((e) => e.componentState?.v);

describe('rewriteHistory', () => {
  it('rewrites every entry without a step of its own', () => {
    const store = storeWith(0, 1, 2);
    store.getState().rewriteHistory((s) => ({ v: (s.v as number) * 10 }));
    expect(entries(store)).toEqual([0, 10, 20]);
    expect(store.getState().historyIndex).toBe(2);
  });

  it('drops an entry on null; the current step hands over to the one before it', () => {
    const store = storeWith(0, 1);
    store.getState().rewriteHistory((s) => (s.v === 1 ? null : s));
    expect(entries(store)).toEqual([0]);
    expect(store.getState().historyIndex).toBe(0);
    expect(store.getState().canUndo()).toBe(false);
  });

  it('collapses an entry that became the same as the one before it, keeping the redo rest', () => {
    const store = storeWith(0, 1, 2, 3);
    store.getState().undo();
    store.getState().rewriteHistory((s) => ({ v: s.v === 1 ? 0 : s.v }));
    expect(entries(store)).toEqual([0, 2, 3]);
    expect(store.getState().historyIndex).toBe(1);
    expect(store.getState().canRedo()).toBe(true);
  });
});
