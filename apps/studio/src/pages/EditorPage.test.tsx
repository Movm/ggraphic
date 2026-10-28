// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  features: { ai: false, removeBackground: false, iconify: false },
  limits: { uploadBytes: 1e7, thumbnailBytes: 1e6, documentBytes: 5e6 },
  uploadTypes: ['image/png'],
};

type Call = { method: string; url: string; body?: unknown };

/** `fetch` with a Studio server that holds one project with `document`. */
function fakeServer(
  document: unknown,
  pack: unknown = null,
  brandFailure: 'none' | 'http500' | 'network' = 'none',
  patchMode: 'ok' | 'schema-version' | 'gone' = 'ok'
) {
  let patch = patchMode;
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
      if (patch === 'gone') return json(404, { error: 'not_found' });
      if (patch === 'schema-version') return json(409, { error: 'schema-version' });
      return json(200, project(2, (sent as { document: unknown }).document));
    }
    if (url === `/api/orgs/${TEST_ORG}/brand-pack`) {
      if (brandFailure === 'network') throw new TypeError('Failed to fetch');
      if (brandFailure === 'http500') return json(500, { error: 'internal' });
      return json(200, { settings: null, assets: [], pack, bundledFonts: [] });
    }
    return json(404, { error: 'not_found' });
  });
  return {
    fetchMock,
    calls,
    /** The project is restored from the Trash: saves succeed again. */
    restore: () => {
      patch = 'ok';
    },
  };
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

  it('goes read-only with a reload action when the server refuses the version', async () => {
    registerBrandPacks([studioBrand]);
    const pack = {
      ...studioBrand,
      id: 'org-x',
      colors: { ...studioBrand.colors, primary: '#336699' },
    };
    // The brand change makes the first save happen; the server answers 409 schema-version.
    const { fetchMock } = fakeServer(
      newDocument('post-portrait', HEADLINE_TEMPLATE_ID),
      pack,
      'none',
      'schema-version'
    );
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await waitFor(() => expect(screen.queryByRole('button', { name: /^Text/ })).not.toBeNull());
    const banner = await screen.findByRole('alert', {}, { timeout: 8000 });
    expect(banner).toHaveTextContent('saved by a newer version of ggraphic');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Text/ })).toBeNull();
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

  describe('when the project was moved to the trash in another tab', () => {
    const brandChanged = () => {
      registerBrandPacks([studioBrand]);
      const pack = {
        ...studioBrand,
        id: 'org-x',
        colors: { ...studioBrand.colors, primary: '#336699' },
      };
      return fakeServer(newDocument('post-portrait', HEADLINE_TEMPLATE_ID), pack, 'none', 'gone');
    };

    it('stops saving, says so with a link to the trash, and asks before leaving', async () => {
      const { fetchMock, calls } = brandChanged();
      vi.stubGlobal('fetch', fetchMock);
      window.history.pushState(null, '', '/p/p1');
      renderEditor();

      const banner = await screen.findByRole('alert', {}, { timeout: 8000 });
      expect(banner).toHaveTextContent(
        'This project was moved to the trash or deleted. Restore it from the Trash to keep your changes.'
      );
      expect(screen.getByRole('link', { name: 'Trash' }).getAttribute('href')).toBe('/trash');
      // No retry loop: past three more polls, still the one save.
      await new Promise((r) => setTimeout(r, 4000));
      expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);

      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      expect(window.location.pathname).toBe('/p/p1');
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
      await waitFor(() => expect(window.location.pathname).toBe('/'));
      confirm.mockRestore();
    }, 25_000);

    it('saves again after a restore when the user tries again', async () => {
      const { fetchMock, calls, restore } = brandChanged();
      vi.stubGlobal('fetch', fetchMock);
      window.history.pushState(null, '', '/p/p1');
      renderEditor();

      await screen.findByRole('alert', {}, { timeout: 8000 });
      restore();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
      expect(screen.getByText('All changes saved')).toBeTruthy();
    }, 25_000);
  });

  describe('a project that is in the trash', () => {
    it('says so, links the trash and restores it on request', async () => {
      let trashed = true;
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      const stored = {
        id: 'p1',
        organisationId: TEST_ORG,
        name: 'Festival',
        schemaVersion: 1,
        version: 1,
        createdAt: '2026-10-28T10:00:00.000Z',
        updatedAt: '2026-10-28T10:00:00.000Z',
        thumbnailUrl: '/api/projects/p1/thumbnail',
        document: newDocument('post-portrait'),
      };
      const calls: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const method = init?.method ?? 'GET';
          calls.push(`${method} ${url}`);
          if (url === '/api/projects/p1/restore' && method === 'POST') {
            trashed = false;
            return json(200, { ...stored, document: undefined });
          }
          if (url === '/api/projects/p1' && method === 'GET') {
            if (trashed) return json(404, { error: 'trashed' });
            return json(200, stored);
          }
          if (url === `/api/orgs/${TEST_ORG}/brand-pack`) {
            return json(200, { settings: null, assets: [], pack: null, bundledFonts: [] });
          }
          return json(404, { error: 'not_found' });
        })
      );
      renderEditor();

      expect(await screen.findByText('This project is in the Trash.')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Open the Trash' }).getAttribute('href')).toBe(
        '/trash'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
      await waitFor(() => expect(document.querySelector('.konvajs-content canvas')).not.toBeNull());
      expect(calls).toContain('POST /api/projects/p1/restore');
    }, 20_000);
  });
});
