// SPDX-License-Identifier: AGPL-3.0-only
import { ContextControls } from './ContextControls.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { messages } from '../../i18n/messages.js';

import type { FloatingModuleState } from '../../hooks/useFloatingModuleState.js';

/**
 * „Effekte“: ein Text-Knopf in der Leiste öffnet den Bereich mit Verlauf,
 * Kontur und Schatten — wer was davon hat, entscheidet `effectsFor`.
 */

const freeText: FloatingModuleState = {
  type: 'text',
  data: { id: 't1', fill: '#005538', isInstanceText: true },
};
const templateText: FloatingModuleState = { type: 'text', data: { id: 't2', fill: '#005538' } };

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

function renderBar(module: FloatingModuleState, onOpenEffects = vi.fn()) {
  render(
    <ContextControls
      selectedElement={module.data.id}
      activeFloatingModule={module}
      canMoveUp={false}
      canMoveDown={false}
      canDuplicate
      handlers={{ ...HANDLERS, onOpenEffects }}
    />
  );
  return onOpenEffects;
}

const t = messages();

describe('Effects button', () => {
  it('opens the area', async () => {
    const onOpenEffects = renderBar(freeText);
    await userEvent.click(screen.getByRole('button', { name: t.topBar.effects }));
    expect(onOpenEffects).toHaveBeenCalledOnce();
  });

  it('is absent where there are no effects (template text)', () => {
    renderBar(templateText);
    expect(screen.queryByRole('button', { name: t.topBar.effects })).toBeNull();
  });
});
