// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type Role, type Session } from '../api/client';
import { studioBrand } from '../brand';
import { TEST_ORG, WithSession } from '../testing/session';
import { AuthPage } from './AuthPage';
import { BrandPage } from './BrandPage';
import { MembersPage } from './MembersPage';

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Handler = (method: string, url: string, body: unknown) => Response | undefined;

function stubServer(handler: Handler) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : (init?.body ?? null);
    calls.push({ method, url, body });
    return handler(method, url, body) ?? json(404, { error: 'not_found' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function renderWith(ui: ReactNode, role?: Role) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WithSession role={role}>{ui}</WithSession>
    </QueryClientProvider>
  );
}

const anonymous = (over: Partial<Session> = {}): Session => ({
  setupRequired: false,
  registrationOpen: false,
  account: null,
  csrfToken: null,
  organisations: [],
  canCreateOrganisations: false,
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AuthPage', () => {
  it('sets up the first account on an empty instance', async () => {
    const calls = stubServer((method, url) =>
      method === 'POST' && url === '/api/auth/setup'
        ? json(201, { ...anonymous(), csrfToken: 't', account: null })
        : undefined
    );
    const user = userEvent.setup();
    renderWith(<AuthPage session={anonymous({ setupRequired: true })} />);
    expect(screen.getByRole('heading', { name: 'Set up ggraphic Studio' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Setup token'), 'printed-token');
    await user.type(screen.getByLabelText('Email'), 'admin@example.org');
    await user.type(screen.getByLabelText('Name'), 'Admin');
    await user.type(screen.getByLabelText('Password'), 'long enough password');
    await user.click(screen.getByRole('button', { name: 'Create the admin account' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/auth/setup')).toBe(true));
    expect(calls.find((c) => c.url === '/api/auth/setup')!.body).toEqual({
      email: 'admin@example.org',
      displayName: 'Admin',
      password: 'long enough password',
      setupToken: 'printed-token',
    });
  });

  it('shows the server message when login fails and hides registration when closed', async () => {
    stubServer(() =>
      json(401, { error: 'invalid_credentials', message: 'Email or password is wrong.' })
    );
    const user = userEvent.setup();
    renderWith(<AuthPage session={anonymous()} />);
    expect(screen.queryByRole('button', { name: 'Create one' })).toBeNull();
    await user.type(screen.getByLabelText('Email'), 'a@example.org');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is wrong.');
  });
});

describe('MembersPage', () => {
  const members = [
    { accountId: 'acc-1', email: 'me@example.org', displayName: 'Me', role: 'owner' },
    { accountId: 'acc-2', email: 'ed@example.org', displayName: 'Ed', role: 'editor' },
  ];

  it('lets an owner create an invitation link and change a role', async () => {
    const calls = stubServer((method, url) => {
      if (url === `/api/orgs/${TEST_ORG}/members`) return json(200, { members });
      if (url === `/api/orgs/${TEST_ORG}/invitations` && method === 'GET') {
        return json(200, { invitations: [] });
      }
      if (url === `/api/orgs/${TEST_ORG}/invitations` && method === 'POST') {
        return json(201, {
          id: 'inv-1',
          role: 'editor',
          createdAt: '2026-10-28T10:00:00.000Z',
          expiresAt: '2026-11-04T10:00:00.000Z',
          allowsSignup: true,
          url: '/invite/secret-token',
        });
      }
      if (method === 'PATCH') return json(204, null);
      return undefined;
    });
    const user = userEvent.setup();
    renderWith(<MembersPage />);
    const list = await screen.findAllByRole('listitem');
    expect(within(list[1]!).getByText('Ed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create invitation link' }));
    expect(
      await screen.findByDisplayValue(`${window.location.origin}/invite/secret-token`)
    ).toBeInTheDocument();
    expect(screen.getByText(/Anyone who has this link can join/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Role of Ed'), 'owner');
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
        url: `/api/orgs/${TEST_ORG}/members/acc-2`,
        body: { role: 'owner' },
      })
    );
  });

  it('shows editors the list without management controls', async () => {
    const calls = stubServer((_m, url) =>
      url === `/api/orgs/${TEST_ORG}/members` ? json(200, { members }) : undefined
    );
    renderWith(<MembersPage />, 'editor');
    expect(await screen.findByText('Ed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create invitation link' })).toBeNull();
    expect(screen.queryByLabelText('Role of Ed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/invitations'))).toBe(false);
  });
});

describe('BrandPage', () => {
  const empty = {
    settings: null,
    assets: [],
    pack: null,
    bundledFonts: ['Raleway', 'Instrument Sans', 'Fraunces'],
  };

  it('starts from the Studio colours, previews edits live and saves them', async () => {
    const calls = stubServer((method, url, body) => {
      if (url !== `/api/orgs/${TEST_ORG}/brand-pack`) return undefined;
      if (method === 'GET') return json(200, empty);
      return json(200, { ...empty, settings: body });
    });
    const user = userEvent.setup();
    renderWith(<BrandPage />);
    const primary = await screen.findByLabelText(/^Primary Main colour/);
    expect(primary).toHaveValue(studioBrand.colors.primary);

    await user.clear(primary);
    await user.type(primary, '#112233');
    const page = screen
      .getByRole('figure', { name: /Preview/ })
      .querySelector('.studio-brand-preview__page') as HTMLElement;
    expect(page.style.background).toBe('rgb(17, 34, 51)');

    await user.click(screen.getByRole('button', { name: 'Save brand' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const saved = calls.find((c) => c.method === 'PUT')!.body as {
      colors: Record<string, string>;
      backgrounds: unknown[];
      fonts: Record<string, string>;
    };
    expect(saved.colors['primary']).toBe('#112233');
    expect(saved.backgrounds).toHaveLength(studioBrand.backgrounds.length);
    expect(saved.fonts).toEqual({ headline: 'Raleway', body: 'Instrument Sans' });
  });

  it('blocks saving an invalid colour', async () => {
    stubServer((method, url) =>
      url === `/api/orgs/${TEST_ORG}/brand-pack` && method === 'GET' ? json(200, empty) : undefined
    );
    const user = userEvent.setup();
    renderWith(<BrandPage />);
    const accent = await screen.findByLabelText(/^Accent Emphasis on dark/);
    await user.clear(accent);
    await user.type(accent, 'pink');
    expect(screen.getByRole('alert')).toHaveTextContent('#RRGGBB');
    expect(screen.getByRole('button', { name: 'Save brand' })).toBeDisabled();
  });

  it('requires a licence before a font can be uploaded', async () => {
    stubServer((method, url) =>
      url === `/api/orgs/${TEST_ORG}/brand-pack` && method === 'GET' ? json(200, empty) : undefined
    );
    const user = userEvent.setup();
    renderWith(<BrandPage />);
    const file = new File([new Uint8Array([0x77, 0x4f, 0x46, 0x32])], 'f.woff2');
    await user.upload(await screen.findByLabelText('File (WOFF2, TTF or OTF)'), file);
    await user.type(screen.getByLabelText('Family name'), 'Mine');
    const button = screen.getByRole('button', { name: 'Upload font' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Licence (required)'), 'OFL-1.1');
    expect(button).toBeEnabled();
  });

  it('tells editors that only owners edit the brand', async () => {
    stubServer(() => json(200, empty));
    renderWith(<BrandPage />, 'editor');
    expect(await screen.findByText(/Only owners/)).toBeInTheDocument();
  });
});
