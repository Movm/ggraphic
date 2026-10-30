// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { type Role } from '../api/client';
import { WithSession } from '../testing/session';
import { AccountBar } from './AccountBar';

function renderBar(role?: Role) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <WithSession role={role}>
        <AccountBar />
      </WithSession>
    </QueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('AccountBar', () => {
  it('shows the wordmark and the profile menu, no tabs and no organisation', () => {
    renderBar();
    expect(screen.getByRole('link', { name: /ggraphic Studio/ })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Projects' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull();
    expect(screen.queryByText('Example org')).toBeNull();
    expect(screen.getByRole('button', { name: /Account/ })).toBeInTheDocument();
  });

  it('offers Brand to owners, then Licences and Log out', async () => {
    const user = userEvent.setup();
    renderBar('owner');
    await user.click(screen.getByRole('button', { name: /Account/ }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Brand',
      'Licences',
      'Log out',
    ]);
  });

  it('leaves Brand out for editors', async () => {
    const user = userEvent.setup();
    renderBar('editor');
    await user.click(screen.getByRole('button', { name: /Account/ }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Licences',
      'Log out',
    ]);
  });

  it('logs out through the API', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole('button', { name: /Account/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('has no axe violations, closed and open', async () => {
    const user = userEvent.setup();
    const { container } = renderBar();
    const options = { rules: { 'color-contrast': { enabled: false } } };
    expect(await axe(container, options)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: /Account/ }));
    // The menu is portalled to <body>, outside this fragment's landmark: not a page-level finding.
    const open = { rules: { ...options.rules, region: { enabled: false } } };
    expect(await axe(document.body, open)).toHaveNoViolations();
  });
});
