// SPDX-License-Identifier: AGPL-3.0-only
// Routes that need no database: config, the static web app and the anonymous refusals.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { createDb } from '../src/db/client.ts';
import { testConfig } from './helpers.ts';

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
    const api = await request(app).get('/api/nope').expect(401);
    expect(api.body).toEqual({ error: 'unauthenticated' });
  });
});

describe('anonymous requests', () => {
  it.each([
    ['get', '/api/orgs/00000000-0000-4000-8000-000000000001/projects'],
    ['post', '/api/orgs/00000000-0000-4000-8000-000000000001/projects'],
    ['get', '/api/projects/00000000-0000-4000-8000-000000000001'],
    ['patch', '/api/projects/00000000-0000-4000-8000-000000000001'],
    ['delete', '/api/projects/00000000-0000-4000-8000-000000000001'],
    ['put', '/api/projects/00000000-0000-4000-8000-000000000001/thumbnail'],
    ['get', '/api/projects/00000000-0000-4000-8000-000000000001/thumbnail'],
    ['post', '/api/orgs/00000000-0000-4000-8000-000000000001/uploads'],
    ['get', `/api/uploads/${'a'.repeat(32)}.png`],
    ['post', '/api/ai/draft'],
    ['post', '/api/orgs'],
    ['get', '/api/orgs/00000000-0000-4000-8000-000000000001/members'],
    ['get', '/api/orgs/00000000-0000-4000-8000-000000000001/brand-pack'],
    ['put', '/api/orgs/00000000-0000-4000-8000-000000000001/brand-pack'],
    ['post', '/api/auth/logout'],
  ] as const)('%s %s answers 401', async (method, path) => {
    const res = await request(makeApp({ ai }).app)[method](path).send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthenticated' });
  });

  it('refuses cross-site state changes before anything else', async () => {
    const res = await request(makeApp().app)
      .post('/api/auth/login')
      .set('sec-fetch-site', 'cross-site')
      .send({ email: 'a@example.org', password: 'x' })
      .expect(403);
    expect(res.body.error).toBe('csrf');
    await request(makeApp().app)
      .post('/api/auth/login')
      .set('sec-fetch-site', 'same-site')
      .send({})
      .expect(403);
  });

  it('caps auth request bodies at 16 kB', async () => {
    const res = await request(makeApp().app)
      .post('/api/auth/login')
      .send({ email: 'a@example.org', password: 'x'.repeat(20_000) })
      .expect(413);
    expect(res.body.error).toBe('too_large');
  });

  it('marks API answers as not cacheable', async () => {
    const res = await request(makeApp().app).get('/api/config').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('same-origin');
  });
});

describe('proxy headers', () => {
  it('warns once when X-Forwarded-For arrives while trust proxy is off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { app } = makeApp();
      await request(app).get('/api/config').set('x-forwarded-for', '198.51.100.1');
      await request(app).get('/api/config').set('x-forwarded-for', '198.51.100.2');
      const proxyWarnings = warn.mock.calls.filter((c) => String(c[0]).includes('TRUST_PROXY'));
      expect(proxyWarnings).toHaveLength(1);
      expect(String(proxyWarnings[0]![0])).not.toContain('198.51.100');
    } finally {
      warn.mockRestore();
    }
  });

  it('stays quiet when trust proxy is configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { app } = makeApp({ trustProxy: 1 });
      await request(app).get('/api/config').set('x-forwarded-for', '198.51.100.1');
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('TRUST_PROXY'))).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });
});
