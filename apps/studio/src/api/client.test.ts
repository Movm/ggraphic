// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from './client';

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
    await expect(api.listProjects()).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('sends the patch with the version it read', async () => {
    const fetchMock = reply(200, {
      id: 'p1',
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
});
