// SPDX-License-Identifier: AGPL-3.0-only
// POST /api/images/remove-background against a stubbed rembg. Needs Postgres (DATABASE_URL) for the login.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { FixedWindowLimiter } from '../src/auth/rateLimit.ts';
import type { RembgConfig } from '../src/config.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { createAuthLimiters } from '../src/routes/auth.ts';
import { PASSWORD, PNG_1X1, resetDb, setupAdmin, testConfig } from './helpers.ts';

const PATH = '/api/images/remove-background';
const rembg: RembgConfig = { url: 'http://rembg.internal:7000', timeoutMs: 1000 };
const hasDb = Boolean(process.env['DATABASE_URL']);

const cutOut = () =>
  new Response(new Uint8Array(PNG_1X1), { status: 200, headers: { 'content-type': 'image/png' } });

describe('anonymous', () => {
  it('needs a session', async () => {
    const config = testConfig({ features: { removeBackground: rembg } });
    const app = createApp({ config, db: createDb(config.databaseUrl).db });
    await request(app).post(PATH).attach('file', PNG_1X1, 'a.png').expect(401);
  });
});

describe.skipIf(!hasDb)('POST /api/images/remove-background (Postgres)', () => {
  const base = testConfig();
  const { pool, db } = createDb(base.databaseUrl);

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await resetDb(pool);
    await setupAdmin(createApp({ config: base, db }));
  });
  afterAll(async () => {
    await pool.end();
  });

  async function loggedIn(
    overrides: Parameters<typeof testConfig>[0] = {},
    fetchImpl?: typeof fetch,
    limit = 100
  ) {
    const app = createApp({
      config: { ...base, ...overrides },
      db,
      fetch: fetchImpl,
      limiters: {
        ...createAuthLimiters(),
        removeBackground: new FixedWindowLimiter({ limit, windowMs: 60_000 }),
      },
    });
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/login')
      .send({ email: 'admin@example.org', password: PASSWORD })
      .expect(200);
    const csrf = res.body.csrfToken as string;
    return { post: () => agent.post(PATH).set('x-csrf-token', csrf) };
  }

  const on = { features: { removeBackground: rembg } };

  it('forwards the image to rembg and returns the PNG', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(cutOut()));
    const res = await (
      await loggedIn(on, fetchMock)
    )
      .post()
      .attach('file', PNG_1X1, 'photo.png')
      .expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(res.body as Buffer, PNG_1X1)).toBe(0);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://rembg.internal:7000/api/remove');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('answers feature_disabled when no rembg is configured', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const res = await (
      await loggedIn({ features: { removeBackground: null } }, fetchMock)
    )
      .post()
      .attach('file', PNG_1X1, 'a.png')
      .expect(503);
    expect(res.body.error).toBe('feature_disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a file that is no image, even with an image name', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const res = await (
      await loggedIn(on, fetchMock)
    )
      .post()
      .attach('file', Buffer.from('MZ not an image'), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(415);
    expect(res.body.error).toBe('unsupported_media_type');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses SVG, which rembg cannot read', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await (
      await loggedIn(on, vi.fn<typeof fetch>())
    )
      .post()
      .attach('file', svg, 'a.svg')
      .expect(415);
  });

  it('answers 400 without a file and 413 above the upload limit', async () => {
    const admin = await loggedIn({ ...on, uploadMaxBytes: 10 }, vi.fn<typeof fetch>());
    await admin.post().expect(400);
    await admin.post().attach('file', PNG_1X1, 'a.png').expect(413);
  });

  it('answers 504 with a fixed message when rembg times out', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('secret detail', 'TimeoutError'));
    const res = await (
      await loggedIn(on, fetchMock)
    )
      .post()
      .attach('file', PNG_1X1, 'a.png')
      .expect(504);
    expect(res.body.error).toBe('rembg_timeout');
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
  });

  it.each([
    ['rembg is down', () => Promise.reject(new TypeError('ECONNREFUSED rembg.internal'))],
    ['rembg answers 500', () => Promise.resolve(new Response('trace', { status: 500 }))],
    ['rembg answers no PNG', () => Promise.resolve(new Response('<html>', { status: 200 }))],
  ])('answers 502 when %s', async (_name, answer) => {
    const res = await (
      await loggedIn(on, vi.fn<typeof fetch>().mockImplementation(answer))
    )
      .post()
      .attach('file', PNG_1X1, 'a.png')
      .expect(502);
    expect(res.body.error).toBe('rembg_upstream_error');
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|trace|html/);
  });

  it('limits background removals per account', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(cutOut()));
    const admin = await loggedIn(on, fetchMock, 2);
    await admin.post().attach('file', PNG_1X1, 'a.png').expect(200);
    await admin.post().attach('file', PNG_1X1, 'a.png').expect(200);
    const limited = await admin.post().attach('file', PNG_1X1, 'a.png').expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
