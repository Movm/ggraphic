// SPDX-License-Identifier: MPL-2.0
import { MultiSelectionToolbar } from './MultiSelectionToolbar.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { messages } from '../../i18n/messages.js';
import { axe } from '../../test-utils';

function renderBar(overrides: Partial<React.ComponentProps<typeof MultiSelectionToolbar>> = {}) {
  const props = {
    count: 3,
    canAlign: true,
    canDistribute: false,
    onCommand: vi.fn(),
    canFlip: true,
    onFlip: vi.fn(),
    ...overrides,
  };
  return { ...render(<MultiSelectionToolbar {...props} />), props };
}

const t = messages();

describe('Multi-selection bar', () => {
  it('is one tab stop; arrows move between its buttons', async () => {
    renderBar();
    const stops = screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    stops[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(stops[0]).not.toHaveFocus();
    expect(screen.getByRole('toolbar')).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('{Home}');
    expect(stops[0]).toHaveFocus();
  });

  it('names the count, flips and aligns', async () => {
    const onFlip = vi.fn();
    renderBar({ onFlip });
    expect(screen.getByRole('toolbar', { name: t.common.elements(3) })).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${t.commands.flipHorizontal}`) })
    );
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${t.commands.flipVertical}`) })
    );
    expect(onFlip.mock.calls).toEqual([['x'], ['y']]);
    expect(screen.getByRole('button', { name: t.topBar.position })).toBeInTheDocument();
  });

  // Copy, duplicate, lock and delete live in the pill above the selection.
  it('carries no object actions', () => {
    renderBar();
    for (const name of [/^Copy/, /^Duplicate/, /Lock$|Unlock$/, /^Delete/, /^Clear selection/]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('has no axe violations', async () => {
    const { container } = renderBar();
    expect(await axe(container)).toHaveNoViolations();
  });
});
