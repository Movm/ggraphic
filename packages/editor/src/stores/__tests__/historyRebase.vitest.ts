// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { createCanvasEditorStore } from '@ggraphic/editor/stores/createCanvasEditorStore';

describe('rebaseHistory', () => {
  it('merges entries a remote edit made equal, as saveToHistory would not have kept them', () => {
    const store = createCanvasEditorStore();
    for (const x of [1, 2, 3]) store.getState().saveToHistory({ x, y: 0 });
    // Entries 1 and 2 only differed in `x`, which the remote now sets on both.
    store.getState().rebaseHistory({ x: 3, y: 0 }, { x: 3, y: 5 });
    store.getState().rebaseHistory({ x: 3, y: 5 }, { x: 4, y: 5 });
    const { history, historyIndex } = store.getState();
    expect(history.map((e) => e.componentState)).toEqual([{ x: 4, y: 5 }]);
    expect(historyIndex).toBe(0);
  });

  it('keeps the position on the entry it pointed at', () => {
    const store = createCanvasEditorStore();
    for (const [x, y] of [
      [0, 0],
      [0, 1],
      [1, 1],
    ])
      store.getState().saveToHistory({ x, y });
    store.getState().undo();
    // Entries 0 and 1 differ only in `y`, which the remote sets to 7 everywhere.
    store.getState().rebaseHistory({ x: 0, y: 1 }, { x: 0, y: 7 });
    const { history, historyIndex } = store.getState();
    expect(history.map((e) => e.componentState)).toEqual([
      { x: 0, y: 7 },
      { x: 1, y: 7 },
    ]);
    expect(historyIndex).toBe(0);
  });

  it('leaves the entries a remote edit does not reach as they were', () => {
    const store = createCanvasEditorStore();
    store.getState().saveToHistory({ x: 1, shapes: [{ id: 'a', x: 1 }] });
    store.getState().saveToHistory({
      x: 1,
      shapes: [
        { id: 'a', x: 1 },
        { id: 'own', x: 2 },
      ],
    });
    const before = store.getState().history[0];
    store.getState().rebaseHistory(
      {
        x: 1,
        shapes: [
          { id: 'a', x: 1 },
          { id: 'own', x: 2 },
        ],
      },
      {
        x: 1,
        shapes: [
          { id: 'a', x: 1 },
          { id: 'own', x: 5 },
        ],
      }
    );
    expect(store.getState().history[0]).toBe(before);
  });
});
