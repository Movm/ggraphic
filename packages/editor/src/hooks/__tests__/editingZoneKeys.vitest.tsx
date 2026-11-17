// SPDX-License-Identifier: AGPL-3.0-only
import { usePageUndoRedoShortcuts } from '../../components/CanvasEditor/hooks/usePageUndoRedoShortcuts.js';
import { useCanvasKeyboardHandlers } from '../useCanvasKeyboardHandlers.js';
import { useCanvasUndoRedo } from '../useCanvasUndoRedo.js';
import {
  createCanvasEditorStore,
  type CanvasEditorStoreApi,
} from '../../stores/createCanvasEditorStore.js';
import { KEEP_EDITING_ATTR } from '../../utils/keyboardOwnership.js';
import { SidebarSlider } from '../../entries/sidebar.js';
import { CanvasStoreProvider, useCanvasStore } from '../../entries/store.js';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BaseCanvasState } from '../../entries/config.js';
import type { CanvasCommands } from '../../utils/canvasCommands.js';

/**
 * While focus is in the format bar of the open text editor (Tab out of the
 * text), text is still being edited: Backspace does not delete the element,
 * Ctrl+Z does not undo the canvas history. And a key a widget has already
 * consumed (Radix slider on Alt+Arrow) does not nudge on top of that.
 */

function setupKeyboard() {
  const store = createCanvasEditorStore();
  const state = {
    shapeInstances: [{ id: 'shape-1', type: 'rect', x: 10, y: 20, fill: '#005538' }],
  } as unknown as BaseCanvasState;
  const updateShape = vi.fn();
  const commands = {
    remove: vi.fn(),
    duplicate: vi.fn(),
  } as unknown as CanvasCommands;
  renderHook(() =>
    useCanvasKeyboardHandlers({
      store,
      state,
      actions: { updateShape },
      setState: vi.fn(),
      setSelectedElement: (id: string | null) => store.getState().setSelectedElement(id),
      commands,
    })
  );
  act(() => store.getState().setSelectedElement('shape-1'));
  return { store, updateShape, commands };
}

function mountToolbarButton(): HTMLButtonElement {
  document.body.innerHTML = `<div role="toolbar" ${KEEP_EDITING_ATTR}><button>Fett</button></div>`;
  const button = document.querySelector('button') as HTMLButtonElement;
  button.focus();
  return button;
}

function press(target: Element, init: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('format bar of the open text editor', () => {
  it('Backspace and Delete on a bar button do not delete the element', () => {
    const h = setupKeyboard();
    const button = mountToolbarButton();
    press(button, { key: 'Backspace' });
    press(button, { key: 'Delete' });
    expect(h.commands.remove).not.toHaveBeenCalled();
  });

  it('Ctrl+D and Alt+Arrow on a bar button do not act on the element', () => {
    const h = setupKeyboard();
    const button = mountToolbarButton();
    press(button, { key: 'd', ctrlKey: true, metaKey: true });
    press(button, { key: 'ArrowRight', altKey: true });
    expect(h.commands.duplicate).not.toHaveBeenCalled();
    expect(h.updateShape).not.toHaveBeenCalled();
  });

  it('Ctrl+Z on a bar button leaves the canvas history alone', () => {
    let store: CanvasEditorStoreApi | null = null;
    function Page() {
      useCanvasUndoRedo(250, undefined, true);
      store = useCanvasStore();
      return null;
    }
    render(
      <CanvasStoreProvider>
        <Page />
      </CanvasStoreProvider>
    );
    if (!store) throw new Error('store not captured');
    const s: CanvasEditorStoreApi = store;
    s.getState().saveToHistory({ n: 1 });
    s.getState().saveToHistory({ n: 2 });
    const before = s.getState().historyIndex;

    const button = mountToolbarButton();
    press(button, { key: 'z', ctrlKey: true, metaKey: true });
    expect(s.getState().historyIndex).toBe(before);

    // Control: outside the bar Ctrl+Z undoes.
    press(document.body, { key: 'z', ctrlKey: true, metaKey: true });
    expect(s.getState().historyIndex).toBe(before - 1);
  });

  it('Ctrl+Z on a bar button does not undo a page step', () => {
    const undoPageOp = vi.fn();
    renderHook(() =>
      usePageUndoRedoShortcuts({
        activePageStamps: () => null,
        pageOpStamps: () => ({ undo: 1, redo: 1 }),
        undoPageOp,
        redoPageOp: vi.fn(),
      })
    );
    const button = mountToolbarButton();
    press(button, { key: 'z', ctrlKey: true, metaKey: true });
    expect(undoPageOp).not.toHaveBeenCalled();
  });
});

describe('Alt+Arrow on the slider', () => {
  function OpacitySlider() {
    const [value, setValue] = useState(0.5);
    return (
      <SidebarSlider
        label="Deckkraft"
        value={value}
        onValueChange={setValue}
        min={0}
        max={1}
        step={0.1}
        unit="%"
      />
    );
  }

  it('sets the value and does not nudge the element', () => {
    const h = setupKeyboard();
    render(<OpacitySlider />);
    const thumb = screen.getByRole('slider', { name: 'Deckkraft' });
    act(() => thumb.focus());
    fireEvent.keyDown(thumb, { key: 'ArrowRight', altKey: true });
    expect(thumb).toHaveAttribute('aria-valuenow', '0.6');
    expect(h.updateShape).not.toHaveBeenCalled();
  });
});
