// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCanvasEditorStore } from '../createCanvasEditorStore.js';
import { nextHistoryStamp } from '../../utils/historyStamp.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('history entries carry the shared history clock', () => {
  it('stamps entries saved in the same millisecond in the order they were saved', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30));
    const store = createCanvasEditorStore();
    store.getState().saveToHistory({ n: 1 });
    store.getState().saveToHistory({ n: 2 });
    store.getState().saveToHistory({ n: 3 });

    const stamps = store.getState().history.map((entry) => entry.timestamp);
    expect(stamps).toHaveLength(3);
    expect(stamps[1]).toBeGreaterThan(stamps[0]!);
    expect(stamps[2]).toBeGreaterThan(stamps[1]!);
  });

  it('draws them from the clock the page-level history uses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30));
    const store = createCanvasEditorStore();
    const pageOp = nextHistoryStamp();
    store.getState().saveToHistory({ n: 1 });
    const element = store.getState().history[0]!.timestamp;
    // Taken later on the one clock, so Undo takes it back first.
    expect(element).toBeGreaterThan(pageOp);
  });
});
