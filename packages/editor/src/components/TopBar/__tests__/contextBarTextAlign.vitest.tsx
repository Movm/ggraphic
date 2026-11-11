// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Text alignment in the context bar (#4963): one button on every text that
 * names the current alignment and cycles left → centre → right. Shapes have
 * no such button, since they carry no text.
 */
import { ContextControls } from '../ContextControls.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import type { FloatingModuleState } from '../../../hooks/useFloatingModuleState.js';

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

function renderBar(module: FloatingModuleState) {
  const handleTextAlignChange = vi.fn();
  const view = render(
    <ContextControls
      selectedElement={module.data.id}
      activeFloatingModule={module}
      canMoveUp
      canMoveDown
      canDuplicate
      handlers={{ ...HANDLERS, handleTextAlignChange }}
    />
  );
  return { ...view, handleTextAlignChange };
}

const text = (align?: 'left' | 'center' | 'right'): FloatingModuleState => ({
  type: 'text',
  data: { id: 'quote-text', fontSize: 56, fill: '#ffffff', ...(align ? { align } : {}) },
});

describe('context bar: text alignment', () => {
  it.each([
    ['center', 'zentriert', 'right'],
    ['right', 'rechtsbündig', 'left'],
    ['left', 'linksbündig', 'center'],
  ] as const)('%s: nennt „%s“ und schaltet weiter auf %s', (align, label, next) => {
    const { handleTextAlignChange } = renderBar(text(align));

    fireEvent.click(screen.getByRole('button', { name: `Textausrichtung: ${label}` }));

    expect(handleTextAlignChange).toHaveBeenCalledWith('quote-text', next);
  });

  it('defaults to left-aligned', () => {
    renderBar(text());
    expect(screen.getByRole('button', { name: 'Textausrichtung: linksbündig' })).toBeTruthy();
  });

  it('is absent for a shape', () => {
    renderBar({ type: 'shape', data: { id: 'shape-1', fill: '#000000' } });
    expect(screen.queryByRole('button', { name: /Textausrichtung/ })).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderBar(text('center'));
    expect(await axe(container)).toHaveNoViolations();
  });
});
