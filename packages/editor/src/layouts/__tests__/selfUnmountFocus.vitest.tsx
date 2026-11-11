// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A button that removes itself with its click ("Auswahl aufheben",
 * "Löschen") takes focus with it. Pressed by keyboard, focus then lands on
 * the page's button, not on `<body>`. With the mouse everything stays as it
 * is: a mouse click must not cause a focus jump.
 */
import { CanvasEditorLayout } from '../../entries/shell.js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

function Editor() {
  const [selected, setSelected] = useState(true);
  return (
    <CanvasEditorLayout
      actions={null}
      contextBar={
        selected ? (
          <button type="button" onClick={() => setSelected(false)}>
            Auswahl aufheben (Esc)
          </button>
        ) : null
      }
    >
      <div
        className="heterogeneous-multipage__page-wrapper"
        role="group"
        aria-label="Seite 1"
        aria-current="page"
      >
        <button type="button" data-page-focus-target="p1">
          Seite 1 bearbeiten
        </button>
      </div>
    </CanvasEditorLayout>
  );
}

describe('focus after a button that removes itself', () => {
  it('moves to the page button on keyboard activation', async () => {
    render(<Editor />);
    const deselect = screen.getByRole('button', { name: 'Auswahl aufheben (Esc)' });
    deselect.focus();
    // Enter/Space on a button fire a click with `detail: 0`.
    fireEvent.click(deselect, { detail: 0 });
    expect(deselect).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Seite 1 bearbeiten' })).toHaveFocus()
    );
  });

  it('leaves focus where it is after a mouse click', async () => {
    render(<Editor />);
    const deselect = screen.getByRole('button', { name: 'Auswahl aufheben (Esc)' });
    deselect.focus();
    fireEvent.click(deselect, { detail: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(screen.getByRole('button', { name: 'Seite 1 bearbeiten' })).not.toHaveFocus();
  });
});
