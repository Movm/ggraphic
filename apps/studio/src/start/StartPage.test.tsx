// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type StudioConfig } from '../api/client';
import { Toaster } from '../ui/toast';

import { nameFromPrompt } from './createFromPrompt';
import { StartPage } from './StartPage';

const config = (ai: boolean): StudioConfig => ({
  features: { ai },
  limits: { uploadBytes: 1e7, thumbnailBytes: 1e6, documentBytes: 5e6 },
  uploadTypes: ['image/png'],
});

const DRAFT = {
  headline: 'Street festival on Saturday',
  subline: 'Music and food for everyone',
  body: 'Old market, 3 pm',
};

type Call = { method: string; url: string; body: Record<string, unknown> | null };

/** `fetch` with a Studio server that knows one project after the first POST. */
function fakeServer({ draft }: { draft: 'ok' | 'timeout' }) {
  const calls: Call[] = [];
  const project = (document: unknown, version: number) => ({
    id: 'p1',
    name: 'x',
    schemaVersion: 1,
    version,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
    thumbnailUrl: null,
    document,
  });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ method, url, body });
    if (url === '/api/projects' && method === 'GET') return json(200, { projects: [] });
    if (url === '/api/projects' && method === 'POST') return json(201, project(body?.document, 1));
    if (url === '/api/ai/draft') {
      return draft === 'ok'
        ? json(200, DRAFT)
        : json(502, { error: 'ai_timeout', message: 'The AI provider did not answer in time.' });
    }
    if (url === '/api/projects/p1' && method === 'PATCH') {
      return json(200, project(body?.document, 2));
    }
    return json(404, { error: 'not_found' });
  });
  return { fetchMock, calls };
}

const headlineOf = (document: unknown) => {
  const page = (document as { pages: { configId: string; state: Record<string, unknown> }[] })
    .pages[0]!;
  const texts = page.state['additionalTexts'] as { id: string; text: string }[];
  return { configId: page.configId, texts: Object.fromEntries(texts.map((t) => [t.id, t.text])) };
};

function renderStart(ai: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StartPage config={config(ai)} />
      <Toaster />
    </QueryClientProvider>
  );
}

describe('StartPage', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));
  afterEach(() => vi.unstubAllGlobals());

  it('creates a project, fills it with the AI draft and opens it', async () => {
    const { fetchMock, calls } = fakeServer({ draft: 'ok' });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderStart(true);

    await user.type(
      screen.getByLabelText('Describe your graphic'),
      'Invite everyone to the street festival next Saturday afternoon'
    );
    await user.click(screen.getByRole('radio', { name: /Square/ }));
    await user.click(screen.getByRole('button', { name: /Create/ }));

    await waitFor(() => expect(window.location.pathname).toBe('/p/p1'));
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/projects')!;
    expect(post.body?.['name']).toBe('Invite everyone to the street festival…');
    expect((post.body?.['document'] as { formatId: string }).formatId).toBe('profile-square');

    const draftCall = calls.find((c) => c.url === '/api/ai/draft')!;
    expect(draftCall.body).toEqual({
      briefing: 'Invite everyone to the street festival next Saturday afternoon',
      width: 1080,
      height: 1080,
    });

    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body?.['version']).toBe(1);
    const page = headlineOf(patch.body?.['document']);
    expect(page.configId).toBe('studio-headline');
    expect(page.texts).toMatchObject({
      headline: DRAFT.headline,
      subline: DRAFT.subline,
      body: DRAFT.body,
    });
  });

  it('without AI puts the prompt into the headline and says how to turn AI on', async () => {
    const { fetchMock, calls } = fakeServer({ draft: 'ok' });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderStart(false);

    expect(
      screen.getByText(/OPENAI_BASE_URL, OPENAI_API_KEY and OPENAI_MODEL/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'A quote about why small steps matter' }));
    await user.click(screen.getByRole('button', { name: /Create/ }));

    await waitFor(() => expect(window.location.pathname).toBe('/p/p1'));
    expect(calls.some((c) => c.url === '/api/ai/draft')).toBe(false);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/projects')!;
    expect(headlineOf(post.body?.['document']).texts['headline']).toBe(
      'A quote about why small steps matter'
    );
  });

  it('opens the template with a notice when the draft fails', async () => {
    const { fetchMock, calls } = fakeServer({ draft: 'timeout' });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderStart(true);

    await user.type(screen.getByLabelText('Describe your graphic'), 'Library opens on Sundays');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(window.location.pathname).toBe('/p/p1'));
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(await screen.findByText(/took too long.*ready for your own text/)).toBeInTheDocument();
    // The project was created with the untouched template.
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/projects')!;
    expect(headlineOf(post.body?.['document']).texts['headline']).toBe('A clear headline');
  });

  it('shows a loading state while the draft runs', async () => {
    let release: (r: Response) => void = () => {};
    const { fetchMock } = fakeServer({ draft: 'ok' });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input) === '/api/ai/draft'
          ? new Promise<Response>((resolve) => (release = resolve))
          : fetchMock(input, init)
      )
    );
    const user = userEvent.setup();
    renderStart(true);

    await user.type(screen.getByLabelText('Describe your graphic'), 'Tree planting');
    await user.click(screen.getByRole('button', { name: /Create/ }));

    expect(await screen.findByRole('button', { name: 'Writing your draft…' })).toBeDisabled();
    expect(screen.getByText(/up to a minute/)).toHaveAttribute('role', 'status');
    release(
      new Response(JSON.stringify(DRAFT), { headers: { 'Content-Type': 'application/json' } })
    );
    await waitFor(() => expect(window.location.pathname).toBe('/p/p1'));
  });
});

describe('nameFromPrompt', () => {
  it('takes the first words', () => {
    expect(nameFromPrompt('  Summer   fair ')).toBe('Summer fair');
    expect(nameFromPrompt('one two three four five six seven')).toBe(
      'one two three four five six…'
    );
    expect(nameFromPrompt('')).toBe('Untitled');
  });
});
