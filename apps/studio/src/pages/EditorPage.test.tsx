// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { type StudioConfig } from '../api/client';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';

import { studioBrand } from '../brand';
import { newDocument } from '../editor/document';
import { HEADLINE_TEMPLATE_ID } from '../editor/templates/ids';
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

type Call = { method: string; url: string; body?: unknown };

/** `fetch` with a Studio server that holds one project with `document`. */
function fakeServer(
  document: unknown,
  pack: unknown = null,
  brandFailure: 'none' | 'http500' | 'network' = 'none'
) {
  const calls: Call[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const sent = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, url, body: sent });
    const project = (version: number, doc: unknown) => ({
      id: 'p1',
      organisationId: TEST_ORG,
      name: 'Festival',
      schemaVersion: 1,
      version,
      createdAt: '2026-10-28T10:00:00.000Z',
      updatedAt: '2026-10-28T10:00:00.000Z',
      thumbnailUrl: '/api/projects/p1/thumbnail',
      document: doc,
    });
    if (url === '/api/projects/p1' && method === 'GET') return json(200, project(1, document));
    if (url === '/api/projects/p1' && method === 'PATCH') {
      return json(200, project(2, (sent as { document: unknown }).document));
    }
    if (url === `/api/orgs/${TEST_ORG}/brand-pack`) {
      if (brandFailure === 'network') throw new TypeError('Failed to fetch');
      if (brandFailure === 'http500') return json(500, { error: 'internal' });
      return json(200, { settings: null, assets: [], pack, bundledFonts: [] });
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

  it('opening a project after a brand change saves the rebound document once', async () => {
    const NEW_PRIMARY = '#336699';
    const pack = {
      ...studioBrand,
      id: 'org-x',
      colors: { ...studioBrand.colors, primary: NEW_PRIMARY },
    };
    // Seeded under the Studio's own brand, opened under the organisation's.
    registerBrandPacks([studioBrand]);
    const { fetchMock, calls } = fakeServer(
      newDocument('post-portrait', HEADLINE_TEMPLATE_ID),
      pack
    );
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1), {
      timeout: 8000,
    });
    await new Promise((r) => setTimeout(r, 3500));
    const saves = calls.filter((c) => c.method === 'PATCH');
    expect(saves).toHaveLength(1);
    const body = saves[0]!.body as {
      document: {
        pages: {
          state: { backgroundColor: string; additionalTexts: { id: string; fill: string }[] };
        }[];
      };
    };
    const state = body.document.pages[0]!.state;
    expect(state.backgroundColor.toLowerCase()).toBe(NEW_PRIMARY);
  }, 20_000);

  it('opening a seeded project under an unchanged brand sends no PUT', async () => {
    registerBrandPacks([studioBrand]);
    const { fetchMock, calls } = fakeServer(newDocument('post-portrait', HEADLINE_TEMPLATE_ID));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await waitFor(() => expect(document.querySelector('.konvajs-content canvas')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 4000));
    expect(calls.filter((c) => c.method === 'PUT' || c.method === 'PATCH')).toEqual([]);
  }, 15_000);

  it.each(['http500', 'network'] as const)(
    'opens as stored and saves nothing when the brand fetch fails (%s)',
    async (failure) => {
      registerBrandPacks([studioBrand]);
      const stored = newDocument('post-portrait', HEADLINE_TEMPLATE_ID);
      // Saved under an organisation brand the Studio cannot load now.
      const state = stored.pages[0]!.state as {
        backgroundColor: string;
        brandStamp: string;
        bind: Record<string, { ref: string; value: string }>;
      };
      state.backgroundColor = '#112233';
      state.bind['backgroundColor'] = { ref: 'ground', value: '#112233' };
      state.brandStamp = 'orgbrand';
      const { fetchMock, calls } = fakeServer(stored, null, failure);
      vi.stubGlobal('fetch', fetchMock);
      renderEditor();

      await waitFor(() => expect(document.querySelector('.konvajs-content canvas')).not.toBeNull());
      await new Promise((r) => setTimeout(r, 4000));
      expect(calls.filter((c) => c.method === 'PUT' || c.method === 'PATCH')).toEqual([]);
    },
    15_000
  );
});
