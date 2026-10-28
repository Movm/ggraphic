// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type Session } from '../api/client';
import { SessionProvider, useLoggedIn, type LoggedIn } from './SessionContext';

const account = { id: 'a', email: 'a@example.org', displayName: 'A', isInstanceAdmin: false };

function session(organisations: Session['organisations']): LoggedIn['session'] {
  return {
    setupRequired: false,
    registrationOpen: false,
    account,
    csrfToken: 'c',
    organisations,
  };
}

function Probe() {
  return <p>{useLoggedIn().organisation.name}</p>;
}

function renderSession(organisations: Session['organisations']) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider session={session(organisations)}>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>
  );
}

describe('SessionProvider', () => {
  it('works in the organisation the account owns, else the first membership', () => {
    const { unmount } = renderSession([
      { id: '1', name: 'Joined', role: 'editor' },
      { id: '2', name: 'Own', role: 'owner' },
    ]);
    expect(screen.getByText('Own')).toBeInTheDocument();
    unmount();
    renderSession([
      { id: '1', name: 'First', role: 'editor' },
      { id: '2', name: 'Second', role: 'editor' },
    ]);
    expect(screen.getByText('First')).toBeInTheDocument();
  });

  it('does not mention invitations when the account has no organisation', () => {
    renderSession([]);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/invitation/i);
  });
});
