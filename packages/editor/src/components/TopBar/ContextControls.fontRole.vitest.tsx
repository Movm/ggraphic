// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContextControls } from './ContextControls.js';
import { messages } from '../../i18n/messages.js';

import type { FloatingModuleState } from '../../hooks/useFloatingModuleState.js';

const base = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

const freeText = {
  type: 'text',
  data: {
    id: 'free-1',
    isInstanceText: true,
    fontSize: 40,
    fontFamily: 'Instrument Sans, Arial, sans-serif',
    bind: { fontFamily: { ref: 'font.body', value: 'Instrument Sans' } },
  },
} as FloatingModuleState;

const templateText = {
  type: 'text',
  data: { id: 'headline', fontSize: 40 },
} as FloatingModuleState;

function show(
  module: FloatingModuleState,
  { canChangeFontRole = true, handler = true } = {}
): ReturnType<typeof vi.fn> {
  const handleFontRoleChange = vi.fn();
  render(
    <ContextControls
      selectedElement={module.data.id}
      activeFloatingModule={module}
      canMoveUp={false}
      canMoveDown={false}
      canDuplicate={false}
      canChangeFontRole={canChangeFontRole}
      handlers={{ ...base, ...(handler ? { handleFontRoleChange } : {}) }}
    />
  );
  return handleFontRoleChange;
}

const picker = () => screen.queryByRole('combobox', { name: messages().topBar.fontRole });

describe('the font role picker in the context bar', () => {
  it('shows the role of a free text and reports a pick for that text', () => {
    const handleFontRoleChange = show(freeText);
    expect((picker() as HTMLSelectElement).value).toBe('body');
    fireEvent.change(picker()!, { target: { value: 'condensed' } });
    expect(handleFontRoleChange).toHaveBeenCalledWith('free-1', 'condensed');
  });

  it('is not shown when the host offers no font roles', () => {
    show(freeText, { canChangeFontRole: false });
    expect(picker()).toBeNull();
  });

  it('is not shown without a handler', () => {
    show(freeText, { handler: false });
    expect(picker()).toBeNull();
  });

  it('is not shown for a text of the template', () => {
    show(templateText);
    expect(picker()).toBeNull();
    // The font size is still there.
    expect(screen.getByLabelText(messages().topBar.fontLarger)).toBeInTheDocument();
  });
});
