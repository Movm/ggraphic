// SPDX-License-Identifier: AGPL-3.0-only
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useToolbarHandlers } from './useToolbarHandlers.js';
import { type HistoryStamps } from '../../../utils/historyStamp.js';

import type { GenericCanvasRef } from '../../GenericCanvas.js';

/**
 * Toolbar Undo/Redo walk the active page's element history and the page-level
 * one (page ops, a replaced deck) in the order the steps were taken.
 */
function setup(page: HistoryStamps | null, pageOps: HistoryStamps) {
  const undo = vi.fn();
  const redo = vi.fn();
  const undoPageOp = vi.fn();
  const redoPageOp = vi.fn();
  const canvasRefsRef = {
    current: [
      { current: { undo, redo, historyStamps: () => page } as unknown as GenericCanvasRef },
    ],
  };
  const { result } = renderHook(() =>
    useToolbarHandlers({
      canvasRefsRef,
      currentPageIndex: 0,
      pageOpStamps: () => pageOps,
      undoPageOp,
      redoPageOp,
      discardReplaceDeck: () => {},
    })
  );
  return { handlers: result.current, undo, redo, undoPageOp, redoPageOp };
}

describe('useToolbarHandlers: undo and redo', () => {
  it('undoes the newer of the page edit and the page op', () => {
    const newerPageEdit = setup({ undo: 5, redo: null }, { undo: 3, redo: null });
    newerPageEdit.handlers.undo();
    expect(newerPageEdit.undo).toHaveBeenCalledTimes(1);
    expect(newerPageEdit.undoPageOp).not.toHaveBeenCalled();

    // A replaced deck after an older edit on the active page.
    const newerPageOp = setup({ undo: 3, redo: null }, { undo: 5, redo: null });
    newerPageOp.handlers.undo();
    expect(newerPageOp.undoPageOp).toHaveBeenCalledTimes(1);
    expect(newerPageOp.undo).not.toHaveBeenCalled();
  });

  it('redoes the older of the two undone steps', () => {
    const olderPageEdit = setup({ undo: null, redo: 3 }, { undo: null, redo: 5 });
    olderPageEdit.handlers.redo();
    expect(olderPageEdit.redo).toHaveBeenCalledTimes(1);
    expect(olderPageEdit.redoPageOp).not.toHaveBeenCalled();

    const olderPageOp = setup({ undo: null, redo: 5 }, { undo: null, redo: 3 });
    olderPageOp.handlers.redo();
    expect(olderPageOp.redoPageOp).toHaveBeenCalledTimes(1);
    expect(olderPageOp.redo).not.toHaveBeenCalled();
  });

  it('falls to the page ops when the page has nothing, and does nothing when neither has', () => {
    const noPageSteps = setup({ undo: null, redo: null }, { undo: 3, redo: 4 });
    noPageSteps.handlers.undo();
    noPageSteps.handlers.redo();
    expect(noPageSteps.undoPageOp).toHaveBeenCalledTimes(1);
    expect(noPageSteps.redoPageOp).toHaveBeenCalledTimes(1);

    const nothing = setup(null, { undo: null, redo: null });
    nothing.handlers.undo();
    nothing.handlers.redo();
    expect(nothing.undo).not.toHaveBeenCalled();
    expect(nothing.undoPageOp).not.toHaveBeenCalled();
    expect(nothing.redo).not.toHaveBeenCalled();
    expect(nothing.redoPageOp).not.toHaveBeenCalled();
  });

  it('reads the page stamps at call time', () => {
    let page: HistoryStamps = { undo: 1, redo: null };
    const undo = vi.fn();
    const undoPageOp = vi.fn();
    const canvasRefsRef = {
      current: [{ current: { undo, historyStamps: () => page } as unknown as GenericCanvasRef }],
    };
    const { result } = renderHook(() =>
      useToolbarHandlers({
        canvasRefsRef,
        currentPageIndex: 0,
        pageOpStamps: () => ({ undo: 2, redo: null }),
        undoPageOp,
        redoPageOp: () => {},
        discardReplaceDeck: () => {},
      })
    );
    result.current.undo();
    expect(undoPageOp).toHaveBeenCalledTimes(1);

    // The page took a newer step after the handlers were built.
    page = { undo: 3, redo: null };
    result.current.undo();
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
