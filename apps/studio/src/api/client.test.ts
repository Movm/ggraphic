// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError, onUnauthenticated } from './client';

const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('reports a version conflict with the current version', async () => {
    vi.stubGlobal(
      'fetch',
      reply(409, { error: 'version_conflict', message: 'Changed', currentVersion: 7 })
    );
    const error = await api.updateProject('p1', { version: 3, name: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isVersionConflict).toBe(true);
    expect((error as ApiError).currentVersion).toBe(7);
  });

  it('rejects an answer that does not match the contract', async () => {
    vi.stubGlobal('fetch', reply(200, { projects: [{ id: 1 }] }));
    await expect(api.listProjects('org-1')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('sends the patch with the version it read', async () => {
    const fetchMock = reply(200, {
      id: 'p1',
      organisationId: 'org-1',
      name: 'x',
      schemaVersion: 1,
      version: 4,
      createdAt: '2026-10-28T10:00:00.000Z',
      updatedAt: '2026-10-28T10:00:00.000Z',
      thumbnailUrl: null,
      document: {},
    });
    vi.stubGlobal('fetch', fetchMock);
    await api.updateProject('p1', {
      version: 3,
      document: { formatId: 'post-portrait', pages: [] },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/projects/p1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      version: 3,
      document: { formatId: 'post-portrait', pages: [] },
    });
  });

  it('sends the session CSRF token on state-changing calls only', async () => {
    const session = {
      setupRequired: false,
      registrationOpen: false,
      account: { id: 'a', email: 'a@example.org', displayName: 'A', isInstanceAdmin: false },
      csrfToken: 'tok-123',
      organisations: [],
      canCreateOrganisations: false,
    };
    vi.stubGlobal('fetch', reply(200, session));
    await api.getSession();
    const fetchMock = reply(200, { projects: [] });
    vi.stubGlobal('fetch', fetchMock);
    await api.listProjects('org-1');
    await api.deleteProject('p1').catch(() => undefined);
    const [getUrl, getInit] = fetchMock.mock.calls[0]!;
    expect(getUrl).toBe('/api/orgs/org-1/projects');
    expect(new Headers(getInit?.headers).get('X-CSRF-Token')).toBeNull();
    const [, delInit] = fetchMock.mock.calls[1]!;
    expect(new Headers(delInit?.headers).get('X-CSRF-Token')).toBe('tok-123');
  });

  it('reports a 401 to the listeners, except for the auth calls themselves', async () => {
    const listener = vi.fn();
    const off = onUnauthenticated(listener);
    vi.stubGlobal('fetch', reply(401, { error: 'unauthenticated' }));
    await api.listProjects('org-1').catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    await api.login({ email: 'a@example.org', password: 'x' }).catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});
