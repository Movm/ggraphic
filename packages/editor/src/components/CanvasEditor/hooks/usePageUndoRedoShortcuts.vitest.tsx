// SPDX-License-Identifier: MPL-2.0
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EDITOR_KEY_SHIELD_ATTRIBUTE,
  usePageUndoRedoShortcuts,
} from '@ggraphic/editor/components/CanvasEditor/hooks/usePageUndoRedoShortcuts';
import { type HistoryStamps } from '@ggraphic/editor/utils/historyStamp';
import { KEEP_EDITING_ATTR } from '@ggraphic/editor/utils/keyboardOwnership';

function setup(activePage: HistoryStamps | null = null) {
  const undoPageOp = vi.fn();
  const redoPageOp = vi.fn();
  renderHook(() =>
    usePageUndoRedoShortcuts({
      activePageStamps: () => activePage,
      pageOpStamps: () => ({ undo: 1, redo: 2 }),
      undoPageOp,
      redoPageOp,
    })
  );
  return { undoPageOp, redoPageOp };
}

const press = (target: HTMLElement, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

const mods = () =>
  navigator.platform.toLowerCase().includes('mac') ? { metaKey: true } : { ctrlKey: true };

afterEach(() => {
  document.body.innerHTML = '';
});

describe('usePageUndoRedoShortcuts', () => {
  it('undoes and redoes page operations from the editor', () => {
    const { undoPageOp, redoPageOp } = setup();
    press(document.body, { key: 'z', ...mods() });
    press(document.body, { key: 'y', ...mods() });
    expect(undoPageOp).toHaveBeenCalledTimes(1);
    expect(redoPageOp).toHaveBeenCalledTimes(1);
  });

  it('leaves a newer page edit (Undo) and an older undone one (Redo) to the page', () => {
    const { undoPageOp, redoPageOp } = setup({ undo: 5, redo: 0 });
    press(document.body, { key: 'z', ...mods() });
    press(document.body, { key: 'y', ...mods() });
    expect(undoPageOp).not.toHaveBeenCalled();
    expect(redoPageOp).not.toHaveBeenCalled();
  });

  it("takes a page op newer than the page's last edit, e.g. a replaced deck", () => {
    const { undoPageOp } = setup({ undo: 0, redo: null });
    press(document.body, { key: 'z', ...mods() });
    expect(undoPageOp).toHaveBeenCalledTimes(1);
  });

  it('stops the key when it takes the page op, so the page never hears it', () => {
    setup({ undo: 0, redo: null });
    const pageHandler = vi.fn();
    window.addEventListener('keydown', pageHandler);
    press(document.body, { key: 'z', ...mods() });
    window.removeEventListener('keydown', pageHandler);
    expect(pageHandler).not.toHaveBeenCalled();
  });

  it('takes Shift+Z as Redo, not as Undo', () => {
    // The page's undone step is newer than the page op's, which comes back first.
    const { undoPageOp, redoPageOp } = setup({ undo: null, redo: 9 });
    press(document.body, { key: 'z', shiftKey: true, ...mods() });
    expect(redoPageOp).toHaveBeenCalledTimes(1);
    expect(undoPageOp).not.toHaveBeenCalled();
  });

  it('ignores keys from a shielded overlay such as the present mode', () => {
    const { undoPageOp, redoPageOp } = setup();
    const overlay = document.createElement('div');
    overlay.setAttribute(EDITOR_KEY_SHIELD_ATTRIBUTE, '');
    overlay.tabIndex = -1;
    const button = document.createElement('button');
    overlay.appendChild(button);
    document.body.appendChild(overlay);

    press(overlay, { key: 'z', ...mods() });
    press(button, { key: 'z', shiftKey: true, ...mods() });
    press(overlay, { key: 'y', ...mods() });
    expect(undoPageOp).not.toHaveBeenCalled();
    expect(redoPageOp).not.toHaveBeenCalled();
  });

  it('takes no page step from a button of the open text editor’s format bar', () => {
    const { undoPageOp } = setup();
    document.body.innerHTML = `<div role="toolbar" ${KEEP_EDITING_ATTR}><button>Fett</button></div>`;
    const button = document.querySelector('button') as HTMLButtonElement;
    button.focus();
    press(button, { key: 'z', ...mods() });
    expect(undoPageOp).not.toHaveBeenCalled();
  });
});
