// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { type StudioConfig } from '../api/client';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { rememberLogoSize } from '../logoSize';

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

  it('a document naming a missing template opens in the editor', async () => {
    const stored = newDocument('post-portrait', HEADLINE_TEMPLATE_ID);
    stored.pages[0]!.configId = 'studio-legacy-gone';
    const { fetchMock } = fakeServer(stored);
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    expect(await screen.findByRole('button', { name: /^Text/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
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

  it('a v2 project opens without a write', async () => {
    registerBrandPacks([studioBrand]);
    const { fetchMock, calls } = fakeServer({
      ...newDocument('post-portrait', HEADLINE_TEMPLATE_ID),
      schemaVersion: 2,
    });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await waitFor(() => expect(document.querySelector('.konvajs-content canvas')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 4000));
    expect(calls.filter((c) => c.method === 'PUT' || c.method === 'PATCH')).toEqual([]);
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

  it('opening under a brand with a second logo fits it in its own proportions', async () => {
    const MAIN = '/api/brand-assets/' + 'c'.repeat(32) + '.png';
    const ALT = '/api/brand-assets/' + 'd'.repeat(32) + '.png';
    rememberLogoSize(MAIN, 400, 100);
    rememberLogoSize(ALT, 100, 100);
    const withMain = { ...studioBrand, id: 'org-x', logo: { src: MAIN, label: 'Main' } };
    // Seeded with the main logo only, opened after the organisation added a square second logo.
    registerBrandPacks([withMain, studioBrand]);
    const stored = newDocument('post-portrait', HEADLINE_TEMPLATE_ID);
    const pack = { ...withMain, logoAlt: { src: ALT, label: 'Alt', ground: 'dark' as const } };
    const { fetchMock, calls } = fakeServer(stored, pack);
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1), {
      timeout: 8000,
    });
    const body = calls.find((c) => c.method === 'PATCH')!.body as {
      document: {
        pages: {
          state: { userImageInstances: { src: string; width: number; height: number }[] };
        }[];
      };
    };
    const logo = body.document.pages[0]!.state.userImageInstances[0]!;
    expect(logo.src).toBe(ALT);
    expect(logo.width / logo.height).toBeCloseTo(1, 1);
  }, 20_000);

  it('saves the rebound document silently: no "Unsaved changes", no leave warning', async () => {
    const pack = {
      ...studioBrand,
      id: 'org-x',
      colors: { ...studioBrand.colors, primary: '#336699' },
    };
    registerBrandPacks([studioBrand]);
    const { fetchMock, calls } = fakeServer(
      newDocument('post-portrait', HEADLINE_TEMPLATE_ID),
      pack
    );
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    const seen = { unsaved: 0, warned: 0 };
    const deadline = Date.now() + 8000;
    while (calls.filter((c) => c.method === 'PATCH').length === 0 && Date.now() < deadline) {
      if (screen.queryByText('Unsaved changes')) seen.unsaved++;
      const leave = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(leave);
      if (leave.defaultPrevented) seen.warned++;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(seen).toEqual({ unsaved: 0, warned: 0 });
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

  it('a block on a blank page stays grouped after reload and follows the brand', async () => {
    type Saved = {
      document: {
        pages: {
          state: {
            brandScheme?: string;
            groups?: {
              id: string;
              blockRef?: { id: string; version: number };
              elementIds: string[];
            }[];
            additionalTexts: { id: string; fill: string; bind?: { fill?: { ref: string } } }[];
          };
        }[];
      };
    };
    registerBrandPacks([studioBrand]);
    // A blank page on the light ground, as a person who picked "Blush" would have.
    const blank = newDocument('post-portrait');
    (blank.pages[0]!.state as Record<string, unknown>)['backgroundColor'] =
      studioBrand.colors.surface;
    const first = fakeServer(blank);
    vi.stubGlobal('fetch', first.fetchMock);
    const user = userEvent.setup();
    const view = renderEditor();

    await waitFor(() => expect(document.querySelector('.konvajs-content canvas')).not.toBeNull());
    await user.click(await screen.findByRole('button', { name: /^Elements/ }));
    await user.click(await screen.findByRole('button', { name: /^Blocks/ }));
    await user.click(await screen.findByRole('button', { name: /Quote with name/ }));
    await waitFor(() => expect(first.calls.some((c) => c.method === 'PATCH')).toBe(true), {
      timeout: 8000,
    });
    const saved = first.calls.filter((c) => c.method === 'PATCH').at(-1)!.body as Saved;
    const stored = saved.document.pages[0]!.state;
    expect(stored.brandScheme).toBe('light');
    expect(stored.groups).toHaveLength(1);
    expect(stored.groups![0]!.blockRef).toEqual({ id: 'studio-quote/quote-with-name', version: 1 });
    expect(stored.groups![0]!.elementIds.slice().sort()).toEqual(
      stored.additionalTexts.map((t) => t.id).sort()
    );
    view.unmount();

    // Reopened after the organisation changed its colours; one member was hand-coloured.
    const HAND = '#123456';
    const markId = stored.additionalTexts.find((t) => t.id.startsWith('quote-mark-'))!.id;
    stored.additionalTexts.find((t) => t.id === markId)!.fill = HAND;
    const pack = {
      ...studioBrand,
      id: 'org-x',
      colors: { ...studioBrand.colors, primary: '#336699', textOnLight: '#336699' },
    };
    const second = fakeServer(saved.document, pack);
    vi.stubGlobal('fetch', second.fetchMock);
    renderEditor();
    await waitFor(() => expect(second.calls.some((c) => c.method === 'PATCH')).toBe(true), {
      timeout: 8000,
    });
    const after = (second.calls.filter((c) => c.method === 'PATCH').at(-1)!.body as Saved).document
      .pages[0]!.state;
    expect(after.groups).toEqual(stored.groups);
    const byPrefix = (prefix: string) =>
      after.additionalTexts.find((t) => t.id.startsWith(prefix))!;
    expect(byPrefix('headline-').bind?.fill?.ref).toBe('ink');
    expect(byPrefix('headline-').fill.toLowerCase()).toBe('#336699');
    expect(byPrefix('quote-mark-').fill).toBe(HAND);
  }, 40_000);

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
