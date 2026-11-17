// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Button, Menu, type MenuItem } from './index.js';

function setup(onBrand = vi.fn(), onLogOut = vi.fn()) {
  const items: MenuItem[] = [
    { label: 'Brand', onSelect: onBrand },
    { separator: true },
    { label: 'Log out', onSelect: onLogOut },
  ];
  render(<Menu trigger={<Button>Profile</Button>} items={items} />);
  return { onBrand, onLogOut, trigger: screen.getByRole('button', { name: 'Profile' }) };
}

describe('Menu', () => {
  it.each([['{Enter}'], [' ']])('opens with %j on the trigger', async (key) => {
    const user = userEvent.setup();
    const { trigger } = setup();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    trigger.focus();
    await user.keyboard(key);
    expect(screen.getByRole('menu', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Brand', 'Log out']);
  });

  it('moves between items with the arrow keys and selects with Enter', async () => {
    const user = userEvent.setup();
    const { trigger, onBrand, onLogOut } = setup();
    trigger.focus();
    await user.keyboard('{Enter}');
    // Opening from the keyboard lands on the first item.
    expect(screen.getByRole('menuitem', { name: 'Brand' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Brand' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onLogOut).toHaveBeenCalledTimes(1);
    expect(onBrand).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('returns focus to the trigger after a selection', async () => {
    const user = userEvent.setup();
    const { trigger, onBrand } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Brand' }));
    expect(onBrand).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it('renders the separator and skips a disabled item', async () => {
    const user = userEvent.setup();
    render(
      <Menu
        trigger={<Button>More</Button>}
        items={[
          { label: 'Rename', onSelect: vi.fn(), disabled: true },
          { separator: true },
          { label: 'Delete', onSelect: vi.fn(), tone: 'danger' },
        ]}
      />
    );
    const trigger = screen.getByRole('button', { name: 'More' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
  });

  it('has no axe violations open or closed', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    const options = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } };
    expect(await axe(document.body, options)).toHaveNoViolations();
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await axe(document.body, options)).toHaveNoViolations();
  });
});
