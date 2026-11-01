// SPDX-License-Identifier: MPL-2.0
import { ContextControls } from '@ggraphic/editor/components/TopBar/ContextControls';
import { messages } from '@ggraphic/editor/i18n/messages';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

/**
 * Sperren in den Auswahl-Steuerungen (mobil im Auswahl-Block des Sheets). Am
 * Desktop sperrt die Pille am Objekt, Löschen steht ebenfalls dort
 * (`selectionPill.vitest.tsx`).
 */

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
  handleToggleLock: () => {},
};

const shapeModule: FloatingModuleState = {
  type: 'shape',
  data: { id: 'shape-1', fill: '#005538' },
};

function renderBar(overrides: Partial<React.ComponentProps<typeof ContextControls>> = {}) {
  return render(
    <ContextControls
      selectedElement="shape-1"
      activeFloatingModule={shapeModule}
      canMoveUp={false}
      canMoveDown={false}
      canDuplicate
      canLock
      handlers={HANDLERS}
      {...overrides}
    />
  );
}

const t = messages();

describe('Lock button', () => {
  it('toggles the lock and shows whether it holds', async () => {
    const handleToggleLock = vi.fn();
    const { rerender } = renderBar({ handlers: { ...HANDLERS, handleToggleLock } });
    const lock = screen.getByRole('button', { name: t.commands.toggleLock });
    expect(lock).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(lock);
    expect(handleToggleLock).toHaveBeenCalledTimes(1);

    rerender(
      <ContextControls
        selectedElement="shape-1"
        activeFloatingModule={shapeModule}
        canMoveUp={false}
        canMoveDown={false}
        canDuplicate
        canLock
        lockState="all"
        handlers={HANDLERS}
      />
    );
    expect(screen.getByRole('button', { name: t.contextMenu.unlock })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('is absent for elements that cannot be locked', () => {
    renderBar({ canLock: false });
    expect(screen.queryByRole('button', { name: t.commands.toggleLock })).toBeNull();
  });
});
