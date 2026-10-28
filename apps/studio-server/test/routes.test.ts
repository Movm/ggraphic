// SPDX-License-Identifier: AGPL-3.0-only
// AI drafts and uploads as a logged-in member. Needs a real Postgres (DATABASE_URL); skipped otherwise.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { FixedWindowLimiter } from '../src/auth/rateLimit.ts';
import { createAuthLimiters } from '../src/routes/auth.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { DEFAULT_ORG, PASSWORD, PNG_1X1, resetDb, setupAdmin, testConfig } from './helpers.ts';

const hasDb = Boolean(process.env['DATABASE_URL']);
const ai = { baseUrl: 'https://llm.example/v1', apiKey: 'sk-secret', model: 'm', timeoutMs: 1000 };
const uploadsPath = `/api/orgs/${DEFAULT_ORG}/uploads`;

describe.skipIf(!hasDb)('routes as a member (Postgres)', () => {
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

  /** The admin, logged in on an app with this config. */
  async function loggedIn(
    overrides: Parameters<typeof testConfig>[0] = {},
    fetchImpl?: typeof fetch,
    { aiPerWindow = 100 }: { aiPerWindow?: number } = {}
  ) {
    const app = createApp({
      config: { ...base, ...overrides },
      db,
      fetch: fetchImpl,
      limiters: {
        ...createAuthLimiters(),
        ai: new FixedWindowLimiter({ limit: aiPerWindow, windowMs: 60_000 }),
      },
    });
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/login')
      .send({ email: 'admin@example.org', password: PASSWORD })
      .expect(200);
    const csrf = res.body.csrfToken as string;
    return {
      get: (path: string) => agent.get(path),
      post: (path: string) => agent.post(path).set('x-csrf-token', csrf),
    };
  }

  describe('POST /api/ai/draft', () => {
    it('answers 503 when AI is off', async () => {
      const res = await (
        await loggedIn({ ai: null })
      )
        .post('/api/ai/draft')
        .send({ briefing: 'x' })
        .expect(503);
      expect(res.body.error).toBe('ai_disabled');
    });

    it('validates the body', async () => {
      await (await loggedIn({ ai })).post('/api/ai/draft').send({ briefing: '' }).expect(400);
    });

    it('limits AI drafts per account', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementation(() =>
          Promise.resolve(
            Response.json({ choices: [{ message: { content: '{"headline":"H","subline":"S"}' } }] })
          )
        );
      const admin = await loggedIn({ ai }, fetchMock, { aiPerWindow: 2 });
      await admin.post('/api/ai/draft').send({ briefing: 'a' }).expect(200);
      await admin.post('/api/ai/draft').send({ briefing: 'b' }).expect(200);
      const limited = await admin.post('/api/ai/draft').send({ briefing: 'c' }).expect(429);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('returns the parsed draft', async () => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: '{"headline":"H","subline":"S","body":""}' } }],
        })
      );
      const res = await (
        await loggedIn({ ai }, fetchMock)
      )
        .post('/api/ai/draft')
        .send({ briefing: 'Sommerfest am Samstag', width: 1080, height: 1080 })
        .expect(200);
      expect(res.body).toEqual({ headline: 'H', subline: 'S' });
    });

    it('answers 502 when the provider fails', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('nope', { status: 500 }));
      const res = await (
        await loggedIn({ ai }, fetchMock)
      )
        .post('/api/ai/draft')
        .send({ briefing: 'x' })
        .expect(502);
      expect(res.body.error).toBe('ai_upstream_error');
    });
  });

  describe('POST /api/ai/pick', () => {
    const offer = {
      brief: 'Street festival on Saturday',
      templates: [
        {
          id: 'headline',
          label: 'Headline',
          description: 'Headline and subline',
          slots: [
            { id: 'headline', label: 'Headline', maxChars: 60 },
            { id: 'subline', label: 'Subline', maxChars: 100 },
          ],
        },
        {
          id: 'number',
          label: 'Big number',
          description: 'One figure',
          slots: [{ id: 'headline', label: 'Meaning', maxChars: 80 }],
        },
      ],
      schemes: [{ id: 'dark', label: 'Dark' }],
    };
    const answer = (content: unknown) =>
      Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
    const good = { templateId: 'number', schemeId: 'dark', fills: { headline: ' Fest ' } };

    it('returns the picked template, scheme and texts', async () => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(answer(good));
      const res = await (
        await loggedIn({ ai }, fetchMock)
      )
        .post('/api/ai/pick')
        .send(offer)
        .expect(200);
      expect(res.body).toEqual({
        templateId: 'number',
        schemeId: 'dark',
        fills: { headline: 'Fest' },
      });
    });

    it('repairs a first answer with an unknown template id', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(answer({ ...good, templateId: 'poster' }))
        .mockResolvedValueOnce(answer(good));
      const res = await (
        await loggedIn({ ai }, fetchMock)
      )
        .post('/api/ai/pick')
        .send(offer)
        .expect(200);
      expect(res.body.templateId).toBe('number');
      const repair = JSON.parse(fetchMock.mock.calls[1]![1]?.body as string) as {
        messages: { content: string }[];
      };
      expect(repair.messages.at(-1)!.content).toContain('templateId "poster" is not offered');
    });

    it('answers 502 after two invalid answers', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementation(() => Promise.resolve(answer({ ...good, templateId: 'poster' })));
      const res = await (
        await loggedIn({ ai }, fetchMock)
      )
        .post('/api/ai/pick')
        .send(offer)
        .expect(502);
      expect(res.body.error).toBe('ai_upstream_error');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('answers like /ai/draft when AI is off', async () => {
      const admin = await loggedIn({ ai: null });
      const pick = await admin.post('/api/ai/pick').send(offer).expect(503);
      const draft = await admin.post('/api/ai/draft').send({ briefing: 'x' }).expect(503);
      expect(pick.body).toEqual(draft.body);
    });

    it.each([
      ['an empty brief', { ...offer, brief: '' }],
      ['a brief over 4000 characters', { ...offer, brief: 'x'.repeat(4001) }],
      ['no templates', { ...offer, templates: [] }],
      [
        '13 templates',
        { ...offer, templates: Array.from({ length: 13 }, () => offer.templates[0]) },
      ],
      ['9 schemes', { ...offer, schemes: Array.from({ length: 9 }, () => offer.schemes[0]) }],
      ['an id outside [a-z0-9-]', { ...offer, schemes: [{ id: 'Dark Mode', label: 'x' }] }],
      [
        'maxChars over 2000',
        {
          ...offer,
          templates: [
            { ...offer.templates[0], slots: [{ id: 'headline', label: 'H', maxChars: 2001 }] },
          ],
        },
      ],
    ])('validates the body: %s', async (_name, body) => {
      await (await loggedIn({ ai })).post('/api/ai/pick').send(body).expect(400);
    });
  });

  describe('uploads', () => {
    it('stores an image under a random name and serves it back', async () => {
      const admin = await loggedIn();
      const res = await admin
        .post(uploadsPath)
        .attach('file', PNG_1X1, { filename: '../../evil.html', contentType: 'text/html' })
        .expect(201);
      expect(res.body.url).toMatch(/^\/api\/uploads\/[0-9a-f]{32}\.png$/);
      expect(res.body.contentType).toBe('image/png');
      const file = await admin.get(res.body.url).expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(file.body as Buffer, PNG_1X1)).toBe(0);
    });

    it('serves SVG sandboxed and as attachment', async () => {
      const admin = await loggedIn();
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
      const res = await admin
        .post(uploadsPath)
        .attach('file', Buffer.from(svg), 'logo.svg')
        .expect(201);
      const file = await admin.get(res.body.url).expect(200);
      expect(file.headers['content-type']).toMatch(/^image\/svg\+xml/);
      expect(file.headers['content-security-policy']).toMatch(/^sandbox/);
      expect(file.headers['content-disposition']).toMatch(/^attachment/);
    });

    it('rejects non-images by content', async () => {
      const res = await (
        await loggedIn()
      )
        .post(uploadsPath)
        .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), {
          filename: 'x.png',
          contentType: 'image/png',
        })
        .expect(415);
      expect(res.body.error).toBe('unsupported_media_type');
    });

    it('rejects files over the limit', async () => {
      const big = Buffer.concat([PNG_1X1, Buffer.alloc(2048)]);
      const res = await (
        await loggedIn({ uploadMaxBytes: 1024 })
      )
        .post(uploadsPath)
        .attach('file', big, 'big.png')
        .expect(413);
      expect(res.body.error).toBe('too_large');
    });

    it('requires a file', async () => {
      await (await loggedIn()).post(uploadsPath).expect(400);
    });

    it.each(['..%2F..%2Fpackage.json', 'nope.png', `${'a'.repeat(32)}.png`, '%2e%2e%2fhelpers.ts'])(
      'answers 404 for %s',
      async (name) => {
        await (await loggedIn()).get(`/api/uploads/${name}`).expect(404);
      }
    );
  });
});
