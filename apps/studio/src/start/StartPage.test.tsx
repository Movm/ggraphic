// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';

import { type StudioConfig } from '../api/client';
import { studioBrand } from '../brand';
import { rememberLogoSize } from '../logoSize';
import { LoggedInContext } from '../session/SessionContext';
import { TEST_ORG, TEST_PROJECTS_URL, WithSession, testSession } from '../testing/session';
import { Toaster } from '../ui/toast';

import { nameFromPrompt } from './createFromPrompt';
import { StartPage } from './StartPage';

// The real pack has no template that one brand can fully drop, so add one that lives in the light world only.
vi.mock('@ggraphic/templates-open', async (importOriginal) => {
  const original = await importOriginal<{ OPEN_TEMPLATES: readonly Record<string, unknown>[] }>();
  const quote = original.OPEN_TEMPLATES.find((t) => t['id'] === 'studio-quote')!;
  const lightOnly = {
    ...quote,
    id: 'studio-light-only',
    title: { en: 'Light only' },
    schemes: ['light'],
  };
  return { ...original, OPEN_TEMPLATES: [...original.OPEN_TEMPLATES, lightOnly] };
});

const config = (ai: boolean): StudioConfig => ({
  features: { ai, removeBackground: false, iconify: false },
  limits: { uploadBytes: 1e7, thumbnailBytes: 1e6, documentBytes: 5e6 },
  uploadTypes: ['image/png'],
});

const DRAFT = {
  headline: 'Street festival on Saturday',
  subline: 'Music and food for everyone',
  body: 'Old market, 3 pm',
};

const PICK = {
  templateId: 'studio-headline',
  schemeId: null,
  fills: { headline: DRAFT.headline, subline: DRAFT.subline, body: DRAFT.body },
};

type Call = { method: string; url: string; body: Record<string, unknown> | null };

/** `fetch` with a Studio server that knows one project after the first POST. */
function fakeServer({
  ai,
  listed = [],
  pack = null,
  createFails = null,
}: {
  ai: 'ok' | 'timeout';
  listed?: unknown[];
  pack?: unknown;
  /** The project POST answers with this error instead of creating. */
  createFails?: { status: number; error: string; message: string } | null;
}) {
  const calls: Call[] = [];
  const project = (document: unknown, version: number) => ({
    id: 'p1',
    organisationId: TEST_ORG,
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
    if (url === TEST_PROJECTS_URL && method === 'GET') return json(200, { projects: listed });
    if (url === TEST_PROJECTS_URL && method === 'POST' && createFails) {
      return json(createFails.status, { error: createFails.error, message: createFails.message });
    }
    if (url === TEST_PROJECTS_URL && method === 'POST')
      return json(201, project(body?.document, 1));
    if (url === `/api/orgs/${TEST_ORG}/brand-pack` && method === 'GET')
      return json(200, { settings: null, assets: [], pack, bundledFonts: [] });
    if (url === '/api/ai/pick') {
      return ai === 'ok'
        ? json(200, PICK)
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

const BRAND_LOGO = '/api/brand-assets/' + 'b'.repeat(32) + '.png';
const orgPack = {
  ...studioBrand,
  id: 'org-brand',
  colors: { ...studioBrand.colors, primary: '#0F3A52' },
  logo: { src: BRAND_LOGO, label: 'Org logo' },
};

const firstPageState = (calls: Call[]) => {
  const post = calls.find((c) => c.method === 'POST' && c.url === TEST_PROJECTS_URL)!;
  return (post.body?.['document'] as { pages: { state: Record<string, unknown> }[] }).pages[0]!
    .state;
};

function renderStart(ai: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WithSession>
        <StartPage config={config(ai)} />
      </WithSession>
      <Toaster />
    </QueryClientProvider>
  );
}

describe('StartPage', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));
  afterEach(() => {
    vi.unstubAllGlobals();
    registerBrandPacks([studioBrand]);
  });

  it('creates a project from what the AI picked and opens it', async () => {
    const { fetchMock, calls } = fakeServer({ ai: 'ok' });
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
    const post = calls.find((c) => c.method === 'POST' && c.url === TEST_PROJECTS_URL)!;
    expect(post.body?.['name']).toBe('Invite everyone to the street festival…');
    expect((post.body?.['document'] as { formatId: string }).formatId).toBe('profile-square');

    const pickCall = calls.find((c) => c.url === '/api/ai/pick')!;
    expect(pickCall.body).toMatchObject({
      brief: 'Invite everyone to the street festival next Saturday afternoon',
      format: { width: 1080, height: 1080 },
    });

    // One project, created with the texts in it: no placeholder first, no later patch.
    expect(calls.filter((c) => c.method === 'POST' && c.url === TEST_PROJECTS_URL)).toHaveLength(1);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    const page = headlineOf(post.body?.['document']);
    expect(page.configId).toBe('studio-blank');
    expect(page.texts).toMatchObject({
      headline: DRAFT.headline,
      subline: DRAFT.subline,
      body: DRAFT.body,
    });
  });

  it('without AI puts the prompt into the headline and says how to turn AI on', async () => {
    const { fetchMock, calls } = fakeServer({ ai: 'ok' });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderStart(false);

    expect(
      screen.getByText(/OPENAI_BASE_URL, OPENAI_API_KEY and OPENAI_MODEL/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'A quote about why small steps matter' }));
    await user.click(screen.getByRole('button', { name: /Create/ }));

    await waitFor(() => expect(window.location.pathname).toBe('/p/p1'));
    expect(calls.some((c) => c.url === '/api/ai/pick')).toBe(false);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    const post = calls.find((c) => c.method === 'POST' && c.url === TEST_PROJECTS_URL)!;
    expect(headlineOf(post.body?.['document']).texts['headline']).toBe(
      'A quote about why small steps matter'
    );
  });

  it('creates nothing and keeps the prompt when the AI fails', async () => {
    const { fetchMock, calls } = fakeServer({ ai: 'timeout' });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderStart(true);

    await user.type(screen.getByLabelText('Describe your graphic'), 'Library opens on Sundays');
    await user.keyboard('{Enter}');

    expect(await screen.findByText(/The AI took too long to answer/)).toBeInTheDocument();
    expect(screen.queryByText(/did not answer in time/)).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(calls.some((c) => c.method === 'POST' && c.url === TEST_PROJECTS_URL)).toBe(false);
    expect(screen.getByLabelText('Describe your graphic')).toHaveValue('Library opens on Sundays');
    expect(screen.getByRole('button', { name: /Create/ })).toBeEnabled();
  });

  it.each([
    [
      500,
      'internal',
      'duplicate key value violates unique constraint "projects_pkey"',
      /project could not be created/i,
    ],
    [403, 'forbidden', 'role viewer may not insert into projects', /not allowed/i],
    [413, 'too_large', 'body exceeds 5242880 bytes', /too large/i],
    [429, 'rate_limited', 'rate limit exceeded: 30/min', /too many/i],
  ])(
    'tells %s from createProject in plain words, not the server text',
    async (status, error, message, friendly) => {
      const { fetchMock } = fakeServer({ ai: 'ok', createFails: { status, error, message } });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderStart(false);

      await user.type(screen.getByLabelText('Describe your graphic'), 'Library opens on Sundays');
      await user.keyboard('{Enter}');

      expect(await screen.findByText(friendly)).toBeInTheDocument();
      expect(screen.queryByText(message)).not.toBeInTheDocument();
      expect(screen.getByLabelText('Describe your graphic')).toHaveValue(
        'Library opens on Sundays'
      );
    }
  );

  it('says the server is unreachable when createProject cannot connect', async () => {
    const { fetchMock } = fakeServer({ ai: 'ok' });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input) === TEST_PROJECTS_URL && init?.method === 'POST'
          ? Promise.reject(new TypeError('Failed to fetch'))
          : fetchMock(input, init)
      )
    );
    const user = userEvent.setup();
    renderStart(false);

    await user.type(screen.getByLabelText('Describe your graphic'), 'Library opens on Sundays');
    await user.keyboard('{Enter}');

    expect(await screen.findByText(/check your connection/i)).toBeInTheDocument();
  });

  it('shows a loading state while the draft runs', async () => {
    let release: (r: Response) => void = () => {};
    const { fetchMock } = fakeServer({ ai: 'ok' });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input) === '/api/ai/pick'
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
      new Response(JSON.stringify(PICK), { headers: { 'Content-Type': 'application/json' } })
    );
    await waitFor(() => expect(window.location.pathname).toBe('/p/p1'));
  });
});

describe('StartPage sections', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));
  afterEach(() => {
    vi.unstubAllGlobals();
    registerBrandPacks([studioBrand]);
  });

  const listed = (id: string, name: string, updatedAt: string) => ({
    id,
    organisationId: TEST_ORG,
    name,
    schemaVersion: 1,
    version: 1,
    createdAt: updatedAt,
    updatedAt,
    thumbnailUrl: null,
  });

  it('lists the projects newest first as links to the editor', async () => {
    const { fetchMock } = fakeServer({
      ai: 'ok',
      listed: [
        listed('old', 'Old poster', '2026-01-01T10:00:00.000Z'),
        listed('new', 'New poster', '2026-10-01T10:00:00.000Z'),
      ],
    });
    vi.stubGlobal('fetch', fetchMock);
    renderStart(true);

    const recent = await screen.findByRole('list', { name: 'Projects' });
    const links = within(recent).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/p/new', '/p/old']);
    expect(links[0]).toHaveAccessibleName(/^Open New poster/);
  });

  it('shows an empty state instead of the grid without projects', async () => {
    const { fetchMock, calls } = fakeServer({ ai: 'ok' });
    vi.stubGlobal('fetch', fetchMock);
    renderStart(true);
    await waitFor(() => expect(calls.some((c) => c.url === TEST_PROJECTS_URL)).toBe(true));
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Projects' })).not.toBeInTheDocument();
  });

  it('puts the templates between the prompt and the project grid', async () => {
    const { fetchMock } = fakeServer({
      ai: 'ok',
      listed: [listed('a', 'A poster', '2026-10-01T10:00:00.000Z')],
    });
    vi.stubGlobal('fetch', fetchMock);
    renderStart(true);
    const grid = await screen.findByRole('list', { name: 'Projects' });
    const prompt = screen.getByRole('textbox', { name: 'Describe your graphic' });
    const templates = screen.getByRole('list', { name: 'Templates' });
    const before = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(prompt.compareDocumentPosition(templates) & before).toBeTruthy();
    expect(templates.compareDocumentPosition(grid) & before).toBeTruthy();
  });

  it("offers only the templates the organisation's brand can place", async () => {
    const near = {
      ...studioBrand,
      id: 'near',
      colors: { ...studioBrand.colors, secondary: '#FAFAFA' },
    };
    const { fetchMock, calls } = fakeServer({ ai: 'ok', pack: near });
    vi.stubGlobal('fetch', fetchMock);
    renderStart(true);

    const templates = screen.getByRole('list', { name: 'Templates' });
    await waitFor(() =>
      expect(calls.some((c) => c.url === `/api/orgs/${TEST_ORG}/brand-pack`)).toBe(true)
    );
    await waitFor(() =>
      expect(
        within(templates).queryByRole('button', { name: /^Light only/ })
      ).not.toBeInTheDocument()
    );
    expect(within(templates).getByRole('button', { name: /^Quote/ })).toBeInTheDocument();
    expect(within(templates).getByRole('button', { name: /^Headline/ })).toBeInTheDocument();
    expect(within(templates).getByRole('button', { name: /^Blank/ })).toBeInTheDocument();
  });

  it('does not let a late brand answer for the previous organisation change the tiles', async () => {
    const near = {
      ...studioBrand,
      id: 'near',
      colors: { ...studioBrand.colors, secondary: '#FAFAFA' },
    };
    let releaseA: () => void = () => {};
    const answered = (pack: unknown) =>
      new Response(JSON.stringify({ settings: null, assets: [], pack, bundledFonts: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/orgs/org-a/brand-pack') {
          await new Promise<void>((resolve) => (releaseA = resolve));
          return answered(near);
        }
        if (url === '/api/orgs/org-b/brand-pack') return answered(null);
        return new Response(JSON.stringify({ projects: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const as = (id: string) => (
      <QueryClientProvider client={client}>
        <LoggedInContext.Provider
          value={{ ...testSession(), organisation: { id, name: id, role: 'owner' } }}
        >
          <StartPage config={config(false)} />
        </LoggedInContext.Provider>
      </QueryClientProvider>
    );
    const user = userEvent.setup();
    const view = render(as('org-a'));
    view.rerender(as('org-b'));

    const templates = screen.getByRole('list', { name: 'Templates' });
    // B answered: its studio brand keeps the light-only template.
    expect(
      await within(templates).findByRole('button', { name: /^Light only/ })
    ).toBeInTheDocument();
    // A answers late with a brand that cannot place it; a new format redraws the tiles.
    releaseA();
    await user.click(screen.getByRole('radio', { name: /1080 × 1080/ }));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(within(templates).getByRole('button', { name: /^Light only/ })).toBeInTheDocument();
  });

  it('creates a project from a template in the chosen format', async () => {
    const { fetchMock, calls } = fakeServer({ ai: 'ok' });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderStart(true);

    await user.click(screen.getByRole('radio', { name: /Landscape/ }));
    const templates = screen.getByRole('list', { name: 'Templates' });
    await user.click(within(templates).getByRole('button', { name: /^Quote/ }));

    await waitFor(() => expect(window.location.pathname).toBe('/p/p1'));
    const post = calls.find((c) => c.method === 'POST' && c.url === TEST_PROJECTS_URL)!;
    expect(post.body?.['name']).toBe('Quote');
    const document = post.body?.['document'] as { formatId: string };
    expect(document.formatId).toBe('slide-16-9');
    expect(headlineOf(document).configId).toBe('studio-blank');
    expect(
      (document as unknown as { pages: { state: { templateRef: { id: string } } }[] }).pages[0]!
        .state.templateRef.id
    ).toBe('studio-quote');
    expect(calls.some((c) => c.url === '/api/ai/pick')).toBe(false);
  });

  it('builds a template project in the organisation brand, logo included', async () => {
    rememberLogoSize(BRAND_LOGO, 400, 100);
    const { fetchMock, calls } = fakeServer({ ai: 'ok', pack: orgPack });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderStart(false);

    const templates = screen.getByRole('list', { name: 'Templates' });
    await user.click(within(templates).getByRole('button', { name: /^Headline/ }));
    await waitFor(() => expect(window.location.pathname).toBe('/p/p1'));

    const state = firstPageState(calls);
    // Seeds write colours in canonical (lower-case) form, as the rebind does.
    expect(state['backgroundColor']).toBe('#0f3a52');
    const images = state['userImageInstances'] as { id: string; src: string }[];
    expect(images.map((i) => [i.id, i.src])).toEqual([['brand-logo', BRAND_LOGO]]);
  });

  it('builds a prompt project in the organisation brand', async () => {
    rememberLogoSize(BRAND_LOGO, 400, 100);
    const { fetchMock, calls } = fakeServer({ ai: 'ok', pack: orgPack });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderStart(false);

    await user.type(screen.getByRole('textbox', { name: 'Describe your graphic' }), 'Pflanztag');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(window.location.pathname).toBe('/p/p1'));

    const state = firstPageState(calls);
    // Seeds write colours in canonical (lower-case) form, as the rebind does.
    expect(state['backgroundColor']).toBe('#0f3a52');
    const images = state['userImageInstances'] as { id: string }[];
    expect(images.map((i) => i.id)).toEqual(['brand-logo']);
  });

  it('has no axe violations', async () => {
    const { fetchMock, calls } = fakeServer({
      ai: 'ok',
      listed: [listed('a', 'A poster', '2026-10-01T10:00:00.000Z')],
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderStart(true);
    await screen.findByRole('list', { name: 'Projects' });
    expect(calls.length).toBeGreaterThan(0);
    // Contrast needs real layout and stylesheets; it is measured in the browser.
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    expect(results).toHaveNoViolations();
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
