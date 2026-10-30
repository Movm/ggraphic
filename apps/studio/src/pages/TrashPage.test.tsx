// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { TEST_ORG, WithSession } from '../testing/session';
import { Toaster } from '../ui/toast';
import { TrashPage } from './TrashPage';

const item = (id: string, name: string, daysLeft: number) => ({
  id,
  organisationId: TEST_ORG,
  name,
  deletedAt: '2026-10-20T10:00:00.000Z',
  purgeAt: '2026-11-19T10:00:00.000Z',
  daysLeft,
});

function fakeServer(initial: ReturnType<typeof item>[]) {
  let trash = [...initial];
  const calls: { method: string; url: string }[] = [];
  const json = (status: number, body: unknown) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    if (url === `/api/orgs/${TEST_ORG}/trash`) return json(200, { projects: trash });
    const restore = /^\/api\/projects\/([^/]+)\/restore$/.exec(url)?.[1];
    if (restore && method === 'POST') {
      const found = trash.find((t) => t.id === restore)!;
      trash = trash.filter((t) => t.id !== restore);
      return json(200, {
        ...found,
        schemaVersion: 1,
        version: 1,
        createdAt: found.deletedAt,
        updatedAt: found.deletedAt,
        thumbnailUrl: null,
      });
    }
    const purge = /^\/api\/projects\/([^/]+)\/purge$/.exec(url)?.[1];
    if (purge && method === 'DELETE') {
      trash = trash.filter((t) => t.id !== purge);
      return json(204, null);
    }
    return json(404, { error: 'not_found' });
  });
  return { fetchMock, calls };
}

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WithSession>
        <TrashPage />
        <Toaster />
      </WithSession>
    </QueryClientProvider>
  );
}

describe('TrashPage', () => {
  beforeEach(() => window.history.replaceState(null, '', '/trash'));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not show the server text when the trash cannot be loaded', async () => {
    const leak = 'SQLSTATE 23505 duplicate key in projects_pkey';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'internal', message: leak }), { status: 500 })
      )
    );
    renderPage();
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(leak)).not.toBeInTheDocument();
  });

  it('lists trashed projects with the day they were deleted and the days left', async () => {
    vi.stubGlobal(
      'fetch',
      fakeServer([item('a', 'Old poster', 12), item('b', 'Flyer', 1)]).fetchMock
    );
    renderPage();
    const list = await screen.findByRole('list', { name: 'Trash' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Old poster')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/Deleted .*2026/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText('12 days left')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('1 day left')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.stubGlobal('fetch', fakeServer([]).fetchMock);
    renderPage();
    expect(await screen.findByText(/The trash is empty/)).toBeInTheDocument();
  });

  it('restores a project', async () => {
    const { fetchMock, calls } = fakeServer([item('a', 'Old poster', 12)]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Restore Old poster' }));
    await waitFor(() => expect(screen.queryByText('Old poster')).toBeNull());
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/projects/a/restore')).toBe(
      true
    );
  });

  it('deletes now only after a confirmation that says it cannot be undone', async () => {
    const { fetchMock, calls } = fakeServer([item('a', 'Old poster', 12)]);
    vi.stubGlobal('fetch', fetchMock);
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const user = userEvent.setup();
    renderPage();
    const button = await screen.findByRole('button', { name: 'Delete now: Old poster' });

    await user.click(button);
    expect(confirm.mock.calls[0]![0]).toMatch(/cannot be undone/);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(button);
    await waitFor(() => expect(screen.queryByText('Old poster')).toBeNull());
    expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/projects/a/purge')).toBe(
      true
    );
  });

  it('has no axe violations', async () => {
    vi.stubGlobal('fetch', fakeServer([item('a', 'Old poster', 12)]).fetchMock);
    const { container } = renderPage();
    await screen.findByText('Old poster');
    expect(
      await axe(container, {
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
      })
    ).toHaveNoViolations();
  });
});
