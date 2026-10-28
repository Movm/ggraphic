// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type Session } from './api/client';
import { App } from './App';

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const loggedIn: Session = {
  setupRequired: false,
  registrationOpen: false,
  account: { id: 'a1', email: 'admin@example.org', displayName: 'Admin', isInstanceAdmin: true },
  csrfToken: 'csrf',
  organisations: [{ id: 'org-1', name: 'Example org', role: 'owner' }],
  canCreateOrganisations: true,
};
const loggedOut: Session = { ...loggedIn, account: null, csrfToken: null, organisations: [] };

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('shows the login right after logging out', async () => {
    let session = loggedIn;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === '/api/auth/session') return json(200, session);
        if (url === '/api/auth/logout' && method === 'POST') {
          session = loggedOut;
          return json(204, null);
        }
        if (url === '/api/config') {
          return json(200, {
            features: { ai: false, removeBackground: false, iconify: false },
            limits: { uploadBytes: 1e7, thumbnailBytes: 1e6, documentBytes: 5e6 },
            uploadTypes: ['image/png'],
          });
        }
        if (url.endsWith('/projects')) return json(200, { projects: [] });
        return json(404, { error: 'not_found' });
      })
    );
    window.history.replaceState(null, '', '/');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });
});
