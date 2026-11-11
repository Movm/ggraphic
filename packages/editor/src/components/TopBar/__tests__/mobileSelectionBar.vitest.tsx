// SPDX-License-Identifier: AGPL-3.0-only
import { MobileSelectionBar } from '../MobileSelectionBar.js';
import { CanvasStoreProvider } from '../../../entries/store.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * On mobile a selection no longer opens a sheet: the bottom bar carries the
 * formatting, "Mehr" opens the area explicitly, ✓ ends the selection.
 * Duplicate and delete live in the pill at the object, not here.
 */

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

function renderBar(props: { onOpenArea?: () => void; onDone?: () => void } = {}) {
  return render(
    <CanvasStoreProvider>
      <MobileSelectionBar
        selectedElement="shape-1"
        activeFloatingModule={{ type: 'shape', data: { id: 'shape-1', fill: '#005538' } }}
        canMoveUp
        canMoveDown={false}
        canDuplicate
        handlers={HANDLERS}
        onDeletePage={() => {}}
        onDeselect={() => {}}
        onDone={props.onDone ?? (() => {})}
        onOpenArea={props.onOpenArea}
      />
    </CanvasStoreProvider>
  );
}

describe('MobileSelectionBar', () => {
  it('carries the formatting but no object actions', () => {
    renderBar();
    expect(screen.getByRole('toolbar', { name: 'Auswahl bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Farbe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplizieren (Strg+D)' })).toBeNull();
    expect(screen.queryByTitle('Seite löschen')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Auswahl aufheben (Esc)' })).toBeNull();
  });

  it('opens the area via "Mehr" and ends via ✓', async () => {
    const onOpenArea = vi.fn();
    const onDone = vi.fn();
    renderBar({ onOpenArea, onDone });
    await userEvent.click(screen.getByRole('button', { name: 'Mehr' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(onOpenArea).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('shows "Mehr" only when the selection has an area', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: 'Mehr' })).toBeNull();
  });
});

describe('MobileSelectionBar: cropping by keyboard', () => {
  afterEach(() => {
    delete document.documentElement.dataset.focusModality;
  });

  function renderPhotoBar(handleCropImage: () => void) {
    return render(
      <CanvasStoreProvider>
        <div aria-current="page">
          <button type="button" data-page-focus-target="p1">
            Seite 1 bearbeiten
          </button>
        </div>
        <MobileSelectionBar
          selectedElement="photo"
          activeFloatingModule={{
            type: 'user-image',
            data: { id: 'photo', src: '/photo.jpg', width: 600, height: 400 },
          }}
          canMoveUp={false}
          canMoveDown={false}
          canDuplicate
          handlers={{ ...HANDLERS, handleCropImage }}
          onDeletePage={() => {}}
          onDeselect={() => {}}
          onDone={() => {}}
        />
      </CanvasStoreProvider>
    );
  }

  // In the toolbar the arrows belong to moving between the buttons;
  // the crop window could not be moved from there.
  it('hands focus to the page so the arrows move the crop window', async () => {
    const crop = vi.fn();
    renderPhotoBar(crop);
    document.documentElement.dataset.focusModality = 'keyboard';
    screen.getByRole('button', { name: 'Zuschneiden' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(crop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Seite 1 bearbeiten' })).toHaveFocus();
  });

  it('leaves focus where it is on a tap', async () => {
    const crop = vi.fn();
    renderPhotoBar(crop);
    document.documentElement.dataset.focusModality = 'pointer';
    await userEvent.click(screen.getByRole('button', { name: 'Zuschneiden' }));
    expect(crop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Seite 1 bearbeiten' })).not.toHaveFocus();
  });
});
