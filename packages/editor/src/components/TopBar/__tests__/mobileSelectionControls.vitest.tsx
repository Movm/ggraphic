// SPDX-License-Identifier: AGPL-3.0-only
import { MobileSelectionControls } from '../MobileSelectionControls.js';
import { CanvasStoreProvider } from '../../../entries/store.js';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * On mobile there is no context bar of its own any more: the selection block
 * at the top of the sheet carries the same controls. Pins that they arrive there.
 */

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

describe('MobileSelectionControls', () => {
  it('names the selection and carries the controls of the context bar', () => {
    render(
      <CanvasStoreProvider>
        <MobileSelectionControls
          selectedElement="shape-1"
          activeFloatingModule={{ type: 'shape', data: { id: 'shape-1', fill: '#005538' } }}
          canMoveUp
          canMoveDown={false}
          canDuplicate
          handlers={HANDLERS}
        />
      </CanvasStoreProvider>
    );
    expect(screen.getByText('Auswahl · Form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplizieren (Strg+D)' })).toBeEnabled();
  });
});
