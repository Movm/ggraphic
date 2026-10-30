// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_ORG, TEST_PROJECTS_URL, WithSession } from '../testing/session';
import { Toaster } from '../ui/toast';
import { ProjectGrid } from './ProjectGrid';

interface Summary {
  id: string;
  organisationId: string;
  name: string;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null;
}

const summary = (id: string, name: string, extra: Partial<Summary> = {}): Summary => ({
  id,
  organisationId: TEST_ORG,
  name,
  schemaVersion: 1,
  version: 1,
  createdAt: '2026-10-27T09:00:00.000Z',
  updatedAt: '2026-10-27T09:30:00.000Z',
  thumbnailUrl: null,
  ...extra,
});

/** A tiny in-memory Studio server behind `fetch`. */
function fakeServer(initial: Summary[]) {
  let projects = [...initial];
  let trashed: Summary[] = [];
  const calls: { method: string; url: string; body: unknown }[] = [];
  const json = (status: number, body: unknown) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
    calls.push({ method, url, body });
    const id = /^\/api\/projects\/([^/]+)$/.exec(url)?.[1];
    if (url === TEST_PROJECTS_URL && method === 'GET') return json(200, { projects });
    if (id && method === 'PATCH') {
      const patch = body as { version: number; name?: string };
      const current = projects.find((p) => p.id === id)!;
      if (patch.version !== current.version) {
        return json(409, { error: 'version_conflict', currentVersion: current.version });
      }
      const next = { ...current, ...patch, version: current.version + 1 };
      projects = projects.map((p) => (p.id === id ? next : p));
      return json(200, { ...next, document: {} });
    }
    if (id && method === 'DELETE') {
      trashed = projects.filter((p) => p.id === id);
      projects = projects.filter((p) => p.id !== id);
      return json(204, null);
    }
    const restoreId = /^\/api\/projects\/([^/]+)\/restore$/.exec(url)?.[1];
    if (restoreId && method === 'POST') {
      const back = trashed.find((p) => p.id === restoreId)!;
      trashed = trashed.filter((p) => p.id !== restoreId);
      projects = [...projects, back];
      return json(200, back);
    }
    return json(404, { error: 'not_found' });
  });
  return { fetchMock, calls };
}

function renderGrid() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WithSession>
        <main>
          <ProjectGrid />
        </main>
        <Toaster />
      </WithSession>
    </QueryClientProvider>
  );
}

describe('ProjectGrid', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not show the server text when the projects cannot be loaded', async () => {
    const leak = 'SQLSTATE 23505 duplicate key in projects_pkey';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'internal', message: leak }), { status: 500 })
      )
    );
    renderGrid();
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(leak)).not.toBeInTheDocument();
  });

  it('lists the projects, newest first, with name, thumbnail and update time', async () => {
    const { fetchMock } = fakeServer([
      summary('b', 'Event invite', { updatedAt: '2026-10-20T09:30:00.000Z' }),
      summary('a', 'Summer poster', { thumbnailUrl: '/api/projects/a/thumbnail?v=1' }),
    ]);
    vi.stubGlobal('fetch', fetchMock);
    renderGrid();

    await screen.findByRole('heading', { name: 'Summer poster' });
    const cards = within(screen.getByRole('list', { name: 'Projects' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByRole('heading', { name: 'Summer poster' })).toBeInTheDocument();
    expect(within(cards[0]!).getByRole('link', { name: 'Open Summer poster' })).toHaveAttribute(
      'href',
      '/p/a'
    );
    expect(cards[0]!.querySelector('img')).toHaveAttribute('src', '/api/projects/a/thumbnail?v=1');
    expect(within(cards[1]!).getByText('No preview yet')).toBeInTheDocument();
    expect(within(cards[1]!).getByRole('link')).toHaveAccessibleName(
      'Open Event invite: No preview yet'
    );
    expect(within(cards[0]!).getByText(/^Updated /)).toBeInTheDocument();
  });

  it('shows all projects, not only the latest few', async () => {
    const many = Array.from({ length: 9 }, (_, i) => summary(`p${i}`, `Poster ${i}`));
    vi.stubGlobal('fetch', fakeServer(many).fetchMock);
    renderGrid();
    await screen.findByRole('heading', { name: 'Poster 0' });
    expect(
      within(screen.getByRole('list', { name: 'Projects' })).getAllByRole('listitem')
    ).toHaveLength(9);
  });

  it('shows an empty state without a search field', async () => {
    vi.stubGlobal('fetch', fakeServer([]).fetchMock);
    renderGrid();
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('filters by name as you type and says how many match', async () => {
    vi.stubGlobal(
      'fetch',
      fakeServer([
        summary('a', 'Summer poster'),
        summary('b', 'Event invite'),
        summary('c', 'Summer picnic'),
      ]).fetchMock
    );
    const user = userEvent.setup();
    renderGrid();
    await screen.findByRole('heading', { name: 'Event invite' });

    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'SUMMER');
    expect(screen.queryByRole('heading', { name: 'Event invite' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Summer poster' })).toBeInTheDocument();
    expect(screen.getByText('2 of 3 projects')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), ' nothing');
    expect(screen.getByText(/No project matches/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Projects' })).toBeNull();
  });

  it('renames a project with the version it listed', async () => {
    const { fetchMock, calls } = fakeServer([summary('a', 'Old name', { version: 3 })]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderGrid();

    await user.click(await screen.findByRole('button', { name: 'Rename Old name' }));
    const input = screen.getByLabelText('New name');
    await user.clear(input);
    await user.type(input, 'New name{Enter}');

    expect(await screen.findByRole('heading', { name: 'New name' })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ version: 3, name: 'New name' });
  });

  it('moves a project to the trash without asking, and offers undo', async () => {
    const { fetchMock, calls } = fakeServer([summary('a', 'Doomed'), summary('b', 'Kept')]);
    vi.stubGlobal('fetch', fetchMock);
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderGrid();

    await user.click(await screen.findByRole('button', { name: 'Move to trash: Doomed' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Doomed' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Kept' })).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/projects/a')).toBe(true);
    expect(screen.getByText(/“Doomed” is in the trash/)).toBeInTheDocument();
  });

  it('brings the project back with Undo', async () => {
    const { fetchMock, calls } = fakeServer([summary('a', 'Doomed')]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderGrid();

    await user.click(await screen.findByRole('button', { name: 'Move to trash: Doomed' }));
    const undo = await screen.findAllByRole('button', { name: 'Undo' });
    await user.click(undo.at(-1)!);

    expect(await screen.findByRole('heading', { name: 'Doomed' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/projects/a/restore')).toBe(
      true
    );
  });

  it('links to the trash', async () => {
    vi.stubGlobal('fetch', fakeServer([]).fetchMock);
    renderGrid();
    const link = await screen.findByRole('link', { name: 'Trash' });
    expect(link).toHaveAttribute('href', '/trash');
  });

  it('has no axe violations', async () => {
    vi.stubGlobal('fetch', fakeServer([summary('a', 'A poster')]).fetchMock);
    const { container } = renderGrid();
    await screen.findByRole('heading', { name: 'A poster' });
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});
