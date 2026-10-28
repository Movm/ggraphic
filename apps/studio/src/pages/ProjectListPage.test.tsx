// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectListPage } from './ProjectListPage';

interface Summary {
  id: string;
  name: string;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null;
}

const summary = (id: string, name: string, extra: Partial<Summary> = {}): Summary => ({
  id,
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
    if (url === '/api/projects' && method === 'GET') return json(200, { projects });
    if (url === '/api/projects' && method === 'POST') {
      const created = { ...summary('new-id', (body as { name: string }).name), document: {} };
      projects = [created, ...projects];
      return json(201, created);
    }
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
      projects = projects.filter((p) => p.id !== id);
      return json(204, null);
    }
    return json(404, { error: 'not_found' });
  });
  return { fetchMock, calls };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProjectListPage />
    </QueryClientProvider>
  );
}

describe('ProjectListPage', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists the projects with name, thumbnail and update time', async () => {
    const { fetchMock } = fakeServer([
      summary('a', 'Summer poster', { thumbnailUrl: '/api/projects/a/thumbnail?v=1' }),
      summary('b', 'Event invite'),
    ]);
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByRole('heading', { name: 'Summer poster' })).toBeInTheDocument();
    expect(within(cards[0]!).getByRole('link', { name: 'Open Summer poster' })).toHaveAttribute(
      'href',
      '/p/a'
    );
    expect(cards[0]!.querySelector('img')).toHaveAttribute('src', '/api/projects/a/thumbnail?v=1');
    expect(within(cards[1]!).getByText('No preview yet')).toBeInTheDocument();
    expect(within(cards[0]!).getByText(/^Updated /)).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.stubGlobal('fetch', fakeServer([]).fetchMock);
    renderPage();
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument();
  });

  it('creates a project in the picked format and opens it', async () => {
    const { fetchMock, calls } = fakeServer([]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Name'), 'Launch');
    await user.click(screen.getByRole('radio', { name: /Square/ }));
    await user.click(screen.getByRole('radio', { name: /Quote/ }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(window.location.pathname).toBe('/p/new-id'));
    const post = calls.find((c) => c.method === 'POST')?.body as {
      name: string;
      document: { formatId: string; pages: { configId: string; state: Record<string, unknown> }[] };
    };
    expect(post.name).toBe('Launch');
    expect(post.document.formatId).toBe('profile-square');
    expect(post.document.pages).toHaveLength(1);
    expect(post.document.pages[0]!.configId).toBe('studio-quote');
    // The page starts with the template's texts spelled out (see `seedPageState`).
    const texts = post.document.pages[0]!.state['additionalTexts'] as { id: string }[];
    expect(texts.map((t) => t.id)).toEqual(['quote-mark', 'headline', 'subline']);
  });

  it('renames a project with the version it listed', async () => {
    const { fetchMock, calls } = fakeServer([summary('a', 'Old name', { version: 3 })]);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Rename Old name' }));
    const input = screen.getByLabelText('New name');
    await user.clear(input);
    await user.type(input, 'New name{Enter}');

    expect(await screen.findByRole('heading', { name: 'New name' })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ version: 3, name: 'New name' });
  });

  it('deletes a project after confirmation', async () => {
    const { fetchMock, calls } = fakeServer([summary('a', 'Doomed'), summary('b', 'Kept')]);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete Doomed' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Doomed' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Kept' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/projects/a')).toBe(true);
  });

  it('keeps a project when the deletion is not confirmed', async () => {
    const { fetchMock, calls } = fakeServer([summary('a', 'Precious')]);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete Precious' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });
});
