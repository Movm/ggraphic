// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { DEFAULT_BRAND_LAYOUT } from '@ggraphic/core';

import { type Role, type Session } from '../api/client';
import { studioBrand } from '../brand';
import { TEST_ORG, WithSession } from '../testing/session';
import { AuthPage } from './AuthPage';
import { BrandPage, defaultSettings } from './BrandPage';

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
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// jsdom has no layout or colours: contrast is measured by the kit's token review instead.
const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

describe('AuthPage', () => {
  it.each([
    ['login', anonymous()],
    ['registration', anonymous({ registrationOpen: true })],
    ['setup', anonymous({ setupRequired: true })],
  ])('has no axe violations on the %s screen', async (_name, session) => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthPage session={session} />
      </QueryClientProvider>
    );
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });

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

  it('does not point to invitation links, which no longer exist', () => {
    renderWith(<AuthPage session={anonymous()} />);
    expect(screen.queryByText(/invitation/i)).toBeNull();
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
    // Only the three chosen colours go out; the server derives the rest.
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
      name: 'Example org',
      colors: {
        primary: '#112233',
        secondary: studioBrand.colors.secondary,
        accent: studioBrand.colors.accent,
      },
      fonts: { headline: 'Raleway', body: 'Instrument Sans', serif: null, condensed: null },
      logoAssetId: null,
      logoAlt: null,
      layout: DEFAULT_BRAND_LAYOUT,
    });
  });

  it('shows the derived colours and updates them live; attention cannot be edited', async () => {
    stubServer((method, url) =>
      url === `/api/orgs/${TEST_ORG}/brand-pack` && method === 'GET' ? json(200, empty) : undefined
    );
    const user = userEvent.setup();
    renderWith(<BrandPage />);
    const list = await screen.findByLabelText('Derived colours');
    const surface = () => within(list).getByText('Surface').parentElement!.textContent;
    const before = surface();
    expect(within(list).getByText('Attention')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Attention/)).toBeNull();
    expect(screen.queryByLabelText(/^Surface/)).toBeNull();

    const primary = screen.getByLabelText(/^Primary Main colour/);
    await user.clear(primary);
    await user.type(primary, '#0b3d2e');
    expect(surface()).not.toBe(before);
  });

  it('tells the owner that saving re-derives hand-set colours of an existing pack', async () => {
    const settings = defaultSettings('Org');
    settings.colors = { ...settings.colors, surface: '#FF00FF' };
    stubServer((method, url) =>
      url === `/api/orgs/${TEST_ORG}/brand-pack` && method === 'GET'
        ? json(200, { ...empty, settings })
        : undefined
    );
    renderWith(<BrandPage />);
    expect(await screen.findByText(/hand-set colours/)).toBeInTheDocument();
  });

  it('also tells the owner when only the stored grounds differ from the derived ones', async () => {
    const { deriveBrandColors, deriveGrounds } = await import('@ggraphic/core');
    const base = defaultSettings('Org');
    const { primary, secondary, accent } = base.colors;
    const grounds = deriveGrounds({ primary, secondary, accent }).map(({ label, color, ink }) => ({
      label,
      color,
      ink,
    }));
    grounds[0] = { ...grounds[0]!, color: '#FF00FF' };
    const edited = {
      ...base,
      colors: deriveBrandColors({ primary, secondary, accent })!,
      backgrounds: grounds,
    };
    stubServer((method, url) =>
      url === `/api/orgs/${TEST_ORG}/brand-pack` && method === 'GET'
        ? json(200, { ...empty, settings: edited })
        : undefined
    );
    renderWith(<BrandPage />);
    expect(await screen.findByText(/hand-set colours/)).toBeInTheDocument();
  });

  it('shows no notice for a new pack or one that already matches the derivation', async () => {
    const { deriveBrandColors, deriveGrounds } = await import('@ggraphic/core');
    const base = defaultSettings('Org');
    const { primary, secondary, accent } = base.colors;
    const matching = {
      ...base,
      colors: deriveBrandColors({ primary, secondary, accent })!,
      backgrounds: deriveGrounds({ primary, secondary, accent }).map(({ label, color, ink }) => ({
        label,
        color,
        ink,
      })),
    };
    stubServer((method, url) =>
      url === `/api/orgs/${TEST_ORG}/brand-pack` && method === 'GET'
        ? json(200, { ...empty, settings: matching })
        : undefined
    );
    renderWith(<BrandPage />);
    await screen.findByLabelText(/^Primary Main colour/);
    expect(screen.queryByText(/hand-set colours/)).toBeNull();
  });

  it('shows and saves the successors of replaced font families', async () => {
    const settings = {
      ...defaultSettings('Org'),
      fonts: { headline: 'Raleway', body: 'PT Sans', serif: null, condensed: null },
    };
    const calls = stubServer((method, url, body) => {
      if (url !== `/api/orgs/${TEST_ORG}/brand-pack`) return undefined;
      if (method === 'GET') return json(200, { ...empty, settings });
      return json(200, { ...empty, settings: body });
    });
    const user = userEvent.setup();
    renderWith(<BrandPage />);
    await screen.findByLabelText(/^Primary Main colour/);
    await user.click(screen.getByRole('button', { name: 'Save brand' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const saved = calls.find((c) => c.method === 'PUT')!.body as { fonts: Record<string, string> };
    expect(saved.fonts).toEqual({
      headline: 'Raleway',
      body: 'Instrument Sans',
      serif: null,
      condensed: null,
    });
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

  it('saves margin, logo corner and logo size', async () => {
    const calls = stubServer((method, url, body) => {
      if (url !== `/api/orgs/${TEST_ORG}/brand-pack`) return undefined;
      if (method === 'GET') return json(200, empty);
      return json(200, { ...empty, settings: body });
    });
    const user = userEvent.setup();
    renderWith(<BrandPage />);
    const margin = await screen.findByLabelText(/^Margin/);
    fireEvent.change(margin, { target: { value: '10' } });
    await user.click(screen.getByRole('radio', { name: 'Top left' }));
    await user.click(screen.getByRole('button', { name: 'Save brand' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect((calls.find((c) => c.method === 'PUT')!.body as { layout: unknown }).layout).toEqual({
      margin: 0.1,
      logoCorner: 'top-left',
      logoMaxWidth: 0.22,
      logoMaxHeight: 0.08,
    });
  });

  it('serif and condensed default to the fallback and save null', async () => {
    const calls = stubServer((method, url, body) => {
      if (url !== `/api/orgs/${TEST_ORG}/brand-pack`) return undefined;
      if (method === 'GET') return json(200, empty);
      return json(200, { ...empty, settings: body });
    });
    const user = userEvent.setup();
    renderWith(<BrandPage />);
    expect(await screen.findByLabelText('Serif')).toHaveTextContent('Same as quotes');
    expect(screen.getByLabelText('Condensed')).toHaveTextContent('Same as headlines');
    await user.click(screen.getByRole('button', { name: 'Save brand' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const fonts = (
      calls.find((c) => c.method === 'PUT')!.body as { fonts: Record<string, unknown> }
    ).fonts;
    expect(fonts.serif).toBeNull();
    expect(fonts.condensed).toBeNull();
  });

  it('a second logo needs a ground', async () => {
    const logo = (id: string) => ({
      id,
      kind: 'logo',
      url: `/api/brand-assets/${id}.png`,
      contentType: 'image/png',
      size: 10,
      family: null,
      weight: null,
      style: null,
      licence: null,
    });
    const withLogos = {
      ...empty,
      assets: [
        logo('11111111-1111-4111-8111-111111111111'),
        logo('22222222-2222-4222-8222-222222222222'),
      ],
    };
    stubServer((method, url) =>
      url === `/api/orgs/${TEST_ORG}/brand-pack` && method === 'GET'
        ? json(200, withLogos)
        : undefined
    );
    // jsdom lacks the pointer-capture and scroll APIs Radix Select calls.
    Object.assign(Element.prototype, {
      hasPointerCapture: () => false,
      releasePointerCapture: () => undefined,
      setPointerCapture: () => undefined,
      scrollIntoView: () => undefined,
    });
    const user = userEvent.setup();
    renderWith(<BrandPage />);
    await user.click(await screen.findByLabelText('Second logo'));
    await user.click(await screen.findByRole('option', { name: 'Logo 2 (PNG)' }));
    expect(screen.getByRole('button', { name: 'Save brand' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'For dark grounds' }));
    expect(screen.getByRole('button', { name: 'Save brand' })).toBeEnabled();
  });

  it('has no axe violations on the brand page', async () => {
    stubServer((method, url) =>
      url === `/api/orgs/${TEST_ORG}/brand-pack` && method === 'GET' ? json(200, empty) : undefined
    );
    const { container } = renderWith(<BrandPage />);
    await screen.findByLabelText('Brand name');
    expect(await axe(container, axeOptions)).toHaveNoViolations();
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

  it('shows the server reason next to the field when a logo is refused', async () => {
    const message = 'Logos must be PNG or WebP. SVG is not accepted.';
    stubServer((method, url) => {
      if (url === `/api/orgs/${TEST_ORG}/brand-pack` && method === 'GET') return json(200, empty);
      if (url === `/api/orgs/${TEST_ORG}/brand-pack/logo` && method === 'POST') {
        return json(415, { error: 'unsupported_media_type', message });
      }
      return undefined;
    });
    // The picker's accept filter hides SVG, but "All files" still lets one through.
    const user = userEvent.setup({ applyAccept: false });
    renderWith(<BrandPage />);
    const input = await screen.findByLabelText(/Upload a logo/);
    await user.upload(input, new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('tells editors that only owners edit the brand', async () => {
    stubServer(() => json(200, empty));
    renderWith(<BrandPage />, 'editor');
    expect(await screen.findByText(/Only owners/)).toBeInTheDocument();
  });
});
