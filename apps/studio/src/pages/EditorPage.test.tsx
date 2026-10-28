// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { type StudioConfig } from '../api/client';
import { newDocument } from '../editor/document';
import { registerEditor } from '../registerEditor';
import { TEST_ORG, WithSession } from '../testing/session';

import { EditorPage } from './EditorPage';

beforeAll(() => registerEditor());
afterEach(() => vi.unstubAllGlobals());

const config: StudioConfig = {
  features: { ai: false },
  limits: { uploadBytes: 1e7, thumbnailBytes: 1e6, documentBytes: 5e6 },
  uploadTypes: ['image/png'],
};

type Call = { method: string; url: string };

/** `fetch` with a Studio server that holds one project with `document`. */
function fakeServer(document: unknown) {
  const calls: Call[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    if (url === '/api/projects/p1' && method === 'GET') {
      return json(200, {
        id: 'p1',
        organisationId: TEST_ORG,
        name: 'Festival',
        schemaVersion: 1,
        version: 1,
        createdAt: '2026-10-28T10:00:00.000Z',
        updatedAt: '2026-10-28T10:00:00.000Z',
        thumbnailUrl: '/api/projects/p1/thumbnail',
        document,
      });
    }
    if (url === `/api/orgs/${TEST_ORG}/brand-pack`) {
      return json(200, { settings: null, assets: [], pack: null, bundledFonts: [] });
    }
    return json(404, { error: 'not_found' });
  });
  return { fetchMock, calls };
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WithSession>
        <EditorPage projectId="p1" config={config} />
      </WithSession>
    </QueryClientProvider>
  );
}

describe('EditorPage', () => {
  it('shows the refusal and no editor for a newer document', async () => {
    const { fetchMock, calls } = fakeServer({
      schemaVersion: 99,
      formatId: 'post-portrait',
      pages: [],
    });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This design was saved with a newer version and cannot be edited here.'
    );
    expect(document.querySelector('.konvajs-content')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Text/ })).toBeNull();
    await new Promise((r) => setTimeout(r, 2500));
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('opening a v1 project sends no PUT', async () => {
    const { fetchMock, calls } = fakeServer(newDocument('post-portrait'));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await waitFor(() => expect(document.querySelector('.konvajs-content canvas')).not.toBeNull());
    // Past the poll (1 s) and the settle delay (1.5 s) of the autosave.
    await new Promise((r) => setTimeout(r, 4000));
    expect(calls.filter((c) => c.method === 'PUT' || c.method === 'PATCH')).toEqual([]);
    expect(screen.queryByText(/Not saved|could not be saved/i)).toBeNull();
  }, 15_000);
});
