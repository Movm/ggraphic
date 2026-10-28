// SPDX-License-Identifier: AGPL-3.0-only
// Routes that need no database: config, uploads, AI drafts, static web app.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { createDb } from '../src/db/client.ts';
import { PNG_1X1, testConfig } from './helpers.ts';

const ai = { baseUrl: 'https://llm.example/v1', apiKey: 'sk-secret', model: 'm', timeoutMs: 1000 };

function makeApp(overrides: Parameters<typeof testConfig>[0] = {}, fetchImpl?: typeof fetch) {
  const config = testConfig(overrides);
  const { db } = createDb(config.databaseUrl);
  return { app: createApp({ config, db, fetch: fetchImpl }), config };
}

describe('GET /api/config', () => {
  it('reports AI off without configuration', async () => {
    const res = await request(makeApp({ ai: null }).app)
      .get('/api/config')
      .expect(200);
    expect(res.body.features).toEqual({ ai: false });
    expect(res.body.limits.uploadBytes).toBe(10 * 1024 * 1024);
    expect(res.body.uploadTypes).toContain('image/png');
  });

  it('reports AI on and never exposes the key', async () => {
    const res = await request(makeApp({ ai }).app).get('/api/config').expect(200);
    expect(res.body.features).toEqual({ ai: true });
    expect(JSON.stringify(res.body)).not.toContain('sk-secret');
  });
});

describe('POST /api/ai/draft', () => {
  it('answers 503 when AI is off', async () => {
    const res = await request(makeApp({ ai: null }).app)
      .post('/api/ai/draft')
      .send({ briefing: 'x' })
      .expect(503);
    expect(res.body.error).toBe('ai_disabled');
  });

  it('validates the body', async () => {
    await request(makeApp({ ai }).app).post('/api/ai/draft').send({ briefing: '' }).expect(400);
  });

  it('returns the parsed draft', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: '{"headline":"H","subline":"S","body":""}' } }],
      })
    );
    const res = await request(makeApp({ ai }, fetchMock).app)
      .post('/api/ai/draft')
      .send({ briefing: 'Sommerfest am Samstag', width: 1080, height: 1080 })
      .expect(200);
    expect(res.body).toEqual({ headline: 'H', subline: 'S' });
  });

  it('answers 502 when the provider fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('nope', { status: 500 }));
    const res = await request(makeApp({ ai }, fetchMock).app)
      .post('/api/ai/draft')
      .send({ briefing: 'x' })
      .expect(502);
    expect(res.body.error).toBe('ai_upstream_error');
  });
});

describe('uploads', () => {
  it('stores an image under a random name and serves it back', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', PNG_1X1, { filename: '../../evil.html', contentType: 'text/html' })
      .expect(201);
    expect(res.body.url).toMatch(/^\/api\/uploads\/[0-9a-f]{32}\.png$/);
    expect(res.body.contentType).toBe('image/png');
    const file = await request(app).get(res.body.url).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(file.body as Buffer, PNG_1X1)).toBe(0);
  });

  it('serves SVG sandboxed and as attachment', async () => {
    const { app } = makeApp();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from(svg), 'logo.svg')
      .expect(201);
    const file = await request(app).get(res.body.url).expect(200);
    expect(file.headers['content-type']).toMatch(/^image\/svg\+xml/);
    expect(file.headers['content-security-policy']).toMatch(/^sandbox/);
    expect(file.headers['content-disposition']).toMatch(/^attachment/);
  });

  it('rejects non-images by content', async () => {
    const res = await request(makeApp().app)
      .post('/api/uploads')
      .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), {
        filename: 'x.png',
        contentType: 'image/png',
      })
      .expect(415);
    expect(res.body.error).toBe('unsupported_media_type');
  });

  it('rejects files over the limit', async () => {
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(2048)]);
    const res = await request(makeApp({ uploadMaxBytes: 1024 }).app)
      .post('/api/uploads')
      .attach('file', big, 'big.png')
      .expect(413);
    expect(res.body.error).toBe('too_large');
  });

  it('requires a file', async () => {
    await request(makeApp().app).post('/api/uploads').expect(400);
  });

  it.each(['..%2F..%2Fpackage.json', 'nope.png', `${'a'.repeat(32)}.png`, '%2e%2e%2fhelpers.ts'])(
    'answers 404 for %s',
    async (name) => {
      await request(makeApp().app).get(`/api/uploads/${name}`).expect(404);
    }
  );
});

describe('web app', () => {
  it('serves static files and falls back to index.html, but not under /api', async () => {
    const config = testConfig();
    mkdirSync(config.staticDir, { recursive: true });
    writeFileSync(join(config.staticDir, 'index.html'), '<!doctype html><title>Studio</title>');
    writeFileSync(join(config.staticDir, 'app.js'), 'console.log(1)');
    const { db } = createDb(config.databaseUrl);
    const app = createApp({ config, db });
    expect((await request(app).get('/').expect(200)).text).toContain('Studio');
    expect((await request(app).get('/projects/123').expect(200)).text).toContain('Studio');
    expect((await request(app).get('/app.js').expect(200)).text).toContain('console.log');
    const api = await request(app).get('/api/nope').expect(404);
    expect(api.body).toEqual({ error: 'not_found' });
  });
});
