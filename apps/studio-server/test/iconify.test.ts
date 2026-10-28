// SPDX-License-Identifier: AGPL-3.0-only
// GET /api/assets/icons/* against a fake Iconify API. Needs Postgres (DATABASE_URL) for the login.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { FixedWindowLimiter } from '../src/auth/rateLimit.ts';
import { ICONIFY_DEFAULT_LICENCES, type IconifyConfig } from '../src/config.ts';
import { createDb } from '../src/db/client.ts';
import { createIconifyClient } from '../src/iconify.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { createAuthLimiters } from '../src/routes/auth.ts';
import { PASSWORD, resetDb, setupAdmin, testConfig } from './helpers.ts';

const hasDb = Boolean(process.env['DATABASE_URL']);
const iconify: IconifyConfig = {
  url: 'http://iconify.internal:3000',
  licences: ICONIFY_DEFAULT_LICENCES,
  timeoutMs: 1000,
};

const set = (name: string, spdx: string, extra: Record<string, unknown> = {}) => ({
  name,
  author: { name: `${name} Authors` },
  license: { title: spdx, spdx },
  ...extra,
});

/** What the fake upstream knows. Each key is an icon-set prefix. */
const COLLECTIONS: Record<string, unknown> = {
  tabler: set('Tabler Icons', 'MIT'),
  lets: set('Lets Icons', 'CC-BY-4.0'),
  typcn: set('Typicons', 'CC-BY-SA-4.0'),
  gplset: set('GPL Set', 'GPL-3.0-or-later'),
  ncset: set('NC Set', 'CC-BY-NC-4.0'),
  fa6: set('Font Awesome 6 Solid', 'CC-BY-4.0'),
  'fa7-solid': set('Font Awesome Solid', 'CC-BY-4.0'),
  ri: set('Remix Icon', 'Apache-2.0', { version: '4.8.0' }),
  'ri-new': set('Remix Icon', 'Apache-2.0', { version: '4.9.0' }),
  noversion: set('Remix Icon', 'Apache-2.0'),
  nolicence: { name: 'No Licence', author: { name: 'x' } },
};
Object.assign(COLLECTIONS, { 'ri-new': set('Remix Icon', 'Apache-2.0', { version: '4.9.0' }) });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h24v24H0z"/></svg>';

const svgResponse = (body: string, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { 'content-type': 'image/svg+xml', ...init.headers } });

interface FakeOptions {
  search?: string[];
  svg?: (prefix: string, name: string) => Response;
  collections?: () => Response;
  /** `GET /{prefix}.json?icons=a,b`: Iconify's batch lookup. Unset = 404, as an old upstream. */
  batch?: (prefix: string, url: URL) => Response;
}

/** A stand-in for api.iconify.design; records every URL it is asked for. */
function fakeIconify(options: FakeOptions = {}) {
  const calls: string[] = [];
  const impl = vi.fn<typeof fetch>((input) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname === '/collections') {
      return Promise.resolve(options.collections?.() ?? Response.json(COLLECTIONS));
    }
    if (url.pathname === '/search') {
      return Promise.resolve(
        Response.json({
          icons: options.search ?? [
            'tabler:tree',
            'typcn:tree',
            'gplset:tree',
            'ncset:tree',
            'fa6:tree',
            'fa7-solid:tree',
            'ri:tree-line',
            'ri-new:tree-line',
            'noversion:tree',
            'nolicence:tree',
            'unknown:tree',
            'lets:tree',
          ],
          total: 12,
        })
      );
    }
    const batch = /^\/([a-z0-9-]+)\.json$/.exec(url.pathname);
    if (batch && options.batch) return Promise.resolve(options.batch(batch[1]!, url));
    const match = /^\/([a-z0-9-]+)\/([a-z0-9-]+)\.svg$/.exec(url.pathname);
    if (match) {
      return Promise.resolve(options.svg?.(match[1]!, match[2]!) ?? svgResponse(SVG));
    }
    return Promise.resolve(new Response('404', { status: 404 }));
  });
  return { impl, calls };
}

describe('anonymous', () => {
  it('needs a session', async () => {
    const config = testConfig({ features: { removeBackground: null, iconify } });
    const app = createApp({ config, db: createDb(config.databaseUrl).db });
    await request(app).get('/api/assets/icons/search?q=tree').expect(401);
    await request(app).get('/api/assets/icons/tabler/tree.svg').expect(401);
  });
});

describe.skipIf(!hasDb)('/api/assets/icons (Postgres)', () => {
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
    fetchImpl: typeof fetch,
    { enabled = true, searchLimit = 100, svgLimit = 100 } = {}
  ) {
    const app = createApp({
      config: { ...base, features: { removeBackground: null, iconify: enabled ? iconify : null } },
      db,
      fetch: fetchImpl,
      limiters: {
        ...createAuthLimiters(),
        iconifySearch: new FixedWindowLimiter({ limit: searchLimit, windowMs: 60_000 }),
        iconifySvg: new FixedWindowLimiter({ limit: svgLimit, windowMs: 60_000 }),
      },
    });
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'admin@example.org', password: PASSWORD })
      .expect(200);
    return agent;
  }

  describe('search', () => {
    it('answers hits with set, licence and author, and never an excluded set', async () => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl);
      const res = await agent.get('/api/assets/icons/search?q=tree&limit=50').expect(200);
      const ids = (res.body.icons as { prefix: string; name: string }[]).map(
        (i) => `${i.prefix}:${i.name}`
      );
      expect(ids).toEqual(['tabler:tree', 'ri:tree-line', 'lets:tree']);
      expect(res.body.icons[0]).toEqual({
        prefix: 'tabler',
        name: 'tree',
        setTitle: 'Tabler Icons',
        licence: 'MIT',
        author: 'Tabler Icons Authors',
      });
      expect(res.body.icons[2]).toMatchObject({
        licence: 'CC-BY-4.0',
        author: 'Lets Icons Authors',
      });
    });

    it('asks upstream only for allowed sets, with the fixed host', async () => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl);
      await agent.get('/api/assets/icons/search?q=tree').expect(200);
      const search = fake.calls.find((c) => c.startsWith('/search'))!;
      const prefixes = new URL(`http://x${search}`).searchParams.get('prefixes')!.split(',');
      expect(prefixes).toContain('tabler');
      for (const excluded of [
        'typcn',
        'gplset',
        'ncset',
        'fa6',
        'fa7-solid',
        'ri-new',
        'nolicence',
      ]) {
        expect(prefixes).not.toContain(excluded);
      }
      for (const [url] of fake.impl.mock.calls) {
        expect(String(url).startsWith('http://iconify.internal:3000/')).toBe(true);
      }
    });

    it('does not trust upstream to filter: a stray excluded hit is dropped', async () => {
      const fake = fakeIconify({ search: ['typcn:tree', 'fa6:tree', 'tabler:tree'] });
      const agent = await loggedIn(fake.impl);
      const res = await agent.get('/api/assets/icons/search?q=tree').expect(200);
      expect(res.body.icons).toHaveLength(1);
    });

    it('limits to one allowed set with prefix, and finds nothing for an excluded one', async () => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl);
      await agent.get('/api/assets/icons/search?q=tree&prefix=tabler').expect(200);
      const search = fake.calls.find((c) => c.startsWith('/search'))!;
      expect(new URL(`http://x${search}`).searchParams.get('prefixes')).toBe('tabler');
      const res = await agent.get('/api/assets/icons/search?q=tree&prefix=typcn').expect(200);
      expect(res.body).toEqual({ icons: [], total: 0 });
    });

    it('caches repeated searches and the licence table', async () => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl);
      await agent.get('/api/assets/icons/search?q=tree').expect(200);
      await agent.get('/api/assets/icons/search?q=tree').expect(200);
      await agent.get('/api/assets/icons/search?q=house').expect(200);
      expect(fake.calls.filter((c) => c.startsWith('/search'))).toHaveLength(2);
      expect(fake.calls.filter((c) => c === '/collections')).toHaveLength(1);
    });

    it('treats case and spacing in a search term as one search', async () => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl);
      await agent.get('/api/assets/icons/search?q=Tree').expect(200);
      await agent.get('/api/assets/icons/search?q=%20tree%20').expect(200);
      await agent.get('/api/assets/icons/search?q=TREE').expect(200);
      await agent.get('/api/assets/icons/search?q=big%20%20Tree').expect(200);
      await agent.get('/api/assets/icons/search?q=big%20tree').expect(200);
      const searches = fake.calls.filter((c) => c.startsWith('/search'));
      expect(searches).toHaveLength(2);
      expect(new URL(`http://x${searches[0]}`).searchParams.get('query')).toBe('tree');
      expect(new URL(`http://x${searches[1]}`).searchParams.get('query')).toBe('big tree');
    });

    it.each([
      ['/api/assets/icons/search'],
      ['/api/assets/icons/search?q='],
      ['/api/assets/icons/search?q=%20%20'],
      [`/api/assets/icons/search?q=${'a'.repeat(65)}`],
      ['/api/assets/icons/search?q=tree&limit=0'],
      ['/api/assets/icons/search?q=tree&limit=500'],
      ['/api/assets/icons/search?q=tree&prefix=../etc'],
      ['/api/assets/icons/search?q=tree&prefix=UPPER'],
    ])('answers 400 for %s', async (path) => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl);
      const res = await agent.get(path).expect(400);
      expect(res.body.error).toBe('invalid_request');
      expect(fake.impl).not.toHaveBeenCalled();
    });

    it('answers feature_disabled and calls nobody when switched off', async () => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl, { enabled: false });
      const res = await agent.get('/api/assets/icons/search?q=tree').expect(503);
      expect(res.body.error).toBe('feature_disabled');
      await agent.get('/api/assets/icons/tabler/tree.svg').expect(503);
      expect(fake.impl).not.toHaveBeenCalled();
    });

    it('answers 504 with a fixed message when upstream times out', async () => {
      const impl = vi.fn<typeof fetch>(() =>
        Promise.reject(new DOMException('secret-host timed out', 'TimeoutError'))
      );
      const agent = await loggedIn(impl);
      const res = await agent.get('/api/assets/icons/search?q=tree').expect(504);
      expect(res.body.error).toBe('iconify_timeout');
      expect(JSON.stringify(res.body)).not.toContain('secret-host');
    });

    it('answers 502 when upstream fails or sends too much', async () => {
      const failing = fakeIconify({ collections: () => new Response('boom', { status: 500 }) });
      const agent = await loggedIn(failing.impl);
      const res = await agent.get('/api/assets/icons/search?q=tree').expect(502);
      expect(res.body.error).toBe('iconify_upstream_error');

      const huge = fakeIconify({
        collections: () =>
          new Response(new ReadableStream({ pull: (c) => c.enqueue(new Uint8Array(512 * 1024)) })),
      });
      const agent2 = await loggedIn(huge.impl);
      await agent2.get('/api/assets/icons/search?q=tree').expect(502);
    });

    it('refuses redirects from upstream', async () => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl);
      await agent.get('/api/assets/icons/search?q=tree').expect(200);
      for (const [, init] of fake.impl.mock.calls) expect(init?.redirect).toBe('error');
    });

    it('rate limits per account', async () => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl, { searchLimit: 2 });
      await agent.get('/api/assets/icons/search?q=a').expect(200);
      await agent.get('/api/assets/icons/search?q=b').expect(200);
      const res = await agent.get('/api/assets/icons/search?q=c').expect(429);
      expect(res.body.error).toBe('rate_limited');
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  describe('refresh', () => {
    it('re-runs the batch and says how long to wait when the upstream is limiting us', async () => {
      const fake = fakeIconify({
        search: ['tabler:tree'],
        batch: () => new Response('', { status: 429, headers: { 'retry-after': '6' } }),
      });
      const agent = await loggedIn(fake.impl);
      const res = await agent.get('/api/assets/icons/search?q=tree&refresh=1').expect(200);
      expect(res.headers['retry-after']).toBe('6');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.icons).toHaveLength(1);
    });
  });

  describe('svg', () => {
    it('answers the icon as image/svg+xml, cached privately', async () => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl);
      const res = await agent.get('/api/assets/icons/tabler/tree.svg').expect(200);
      expect(res.headers['content-type']).toMatch(/^image\/svg\+xml/);
      expect(res.headers['cache-control']).toBe('private, max-age=3600');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(Buffer.from(res.body as Buffer).toString()).toBe(SVG);
      await agent.get('/api/assets/icons/tabler/tree.svg').expect(200);
      expect(fake.calls.filter((c) => c.endsWith('.svg'))).toEqual(['/tabler/tree.svg']);
    });

    it('never serves an excluded or unknown set', async () => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl);
      for (const prefix of ['typcn', 'gplset', 'ncset', 'fa6', 'ri-new', 'noversion', 'unknown']) {
        await agent.get(`/api/assets/icons/${prefix}/tree.svg`).expect(404);
      }
      expect(fake.calls.filter((c) => c.endsWith('.svg'))).toEqual([]);
    });

    it.each([
      ['/api/assets/icons/TABLER/tree.svg'],
      ['/api/assets/icons/tabler/Tree.svg'],
      ['/api/assets/icons/tabler/tr%20ee.svg'],
      ['/api/assets/icons/tabler/..%2F..%2Fsecret.svg'],
      ['/api/assets/icons/tab_ler/tree.svg'],
    ])('answers 400 for %s', async (path) => {
      const fake = fakeIconify();
      const agent = await loggedIn(fake.impl);
      await agent.get(path).expect(400);
      expect(fake.impl).not.toHaveBeenCalled();
    });

    it('answers 404 when upstream has no such icon', async () => {
      const agent = await loggedIn(
        fakeIconify({ svg: () => new Response('404', { status: 404 }) }).impl
      );
      const res = await agent.get('/api/assets/icons/tabler/nope.svg').expect(404);
      expect(res.body.error).toBe('not_found');
    });

    it('answers 429 with Retry-After when upstream rate-limits, not 502', async () => {
      const agent = await loggedIn(
        fakeIconify({
          svg: () => new Response('', { status: 429, headers: { 'retry-after': '5' } }),
        }).impl
      );
      const res = await agent.get('/api/assets/icons/tabler/tree.svg').expect(429);
      expect(res.body.error).toBe('iconify_rate_limited');
      expect(res.headers['retry-after']).toBe('5');
    });

    it('answers 502 for a body that is no svg we can make safe', async () => {
      for (const body of [
        '<html></html>',
        '<svg/onload=alert(1) xmlns="http://www.w3.org/2000/svg"></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" a="1"onload="x()"></svg>',
        '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
      ]) {
        const agent = await loggedIn(fakeIconify({ svg: () => svgResponse(body) }).impl);
        await agent.get('/api/assets/icons/tabler/tree.svg').expect(502);
      }
    });

    it('serves the sanitised svg, not what upstream sent', async () => {
      const dirty =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script>' +
        '<image href="http://evil/x.png"/><style>@\\69mport "x";</style>' +
        '<path d="M0 0h24" onclick="x()" style="fill:red" fill="url(#g)"/>' +
        '<use href="#a"/><a href="javascript:x"><animate attributeName="href" values="javascript&#58;x"/></a></svg>';
      const agent = await loggedIn(fakeIconify({ svg: () => svgResponse(dirty) }).impl);
      const res = await agent.get('/api/assets/icons/tabler/tree.svg').expect(200);
      expect(Buffer.from(res.body as Buffer).toString()).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24" fill="url(#g)"/><use href="#a"/></svg>'
      );
    });

    it('answers 502 when upstream does not say it sends an svg', async () => {
      for (const type of ['text/html', 'application/json', 'text/plain']) {
        const agent = await loggedIn(
          fakeIconify({ svg: () => new Response(SVG, { headers: { 'content-type': type } }) }).impl
        );
        await agent.get('/api/assets/icons/tabler/tree.svg').expect(502);
      }
    });

    it('answers 502 when Content-Length already says too much', async () => {
      const agent = await loggedIn(
        fakeIconify({ svg: () => svgResponse(SVG, { headers: { 'content-length': '999999' } }) })
          .impl
      );
      await agent.get('/api/assets/icons/tabler/tree.svg').expect(502);
      const agent2 = await loggedIn(
        fakeIconify({
          collections: () =>
            Response.json(COLLECTIONS, { headers: { 'content-length': '99999999' } }),
        }).impl
      );
      await agent2.get('/api/assets/icons/search?q=tree').expect(502);
    });

    it('answers 502 for an oversize body', async () => {
      const big = '<svg xmlns="http://www.w3.org/2000/svg">' + ' '.repeat(200 * 1024) + '</svg>';
      const agent = await loggedIn(fakeIconify({ svg: () => svgResponse(big) }).impl);
      await agent.get('/api/assets/icons/tabler/tree.svg').expect(502);
    });

    it('answers 504 on timeout and 429 over the limit', async () => {
      const slow = fakeIconify({
        svg: () => {
          throw new DOMException('x', 'TimeoutError');
        },
      });
      const agent = await loggedIn(slow.impl);
      await agent.get('/api/assets/icons/tabler/tree.svg').expect(504);

      const agent2 = await loggedIn(fakeIconify().impl, { svgLimit: 1 });
      await agent2.get('/api/assets/icons/tabler/tree.svg').expect(200);
      await agent2.get('/api/assets/icons/tabler/house.svg').expect(429);
    });
  });
});

/** The batch answer for the icons a request names: one 24 px path each. */
const batchAnswer = (_prefix: string, url: URL) =>
  Response.json({
    prefix: _prefix,
    width: 24,
    height: 24,
    icons: Object.fromEntries(
      (url.searchParams.get('icons') ?? '')
        .split(',')
        .map((n) => [n, { body: '<path fill="currentColor" d="M1 1h22v22H1z"/>' }])
    ),
  });

describe('iconify client', () => {
  it('maps an upstream 429 to a 429 with Retry-After, never a 502', async () => {
    const fake = fakeIconify({
      collections: () =>
        new Response('slow down', { status: 429, headers: { 'retry-after': '7' } }),
    });
    const client = createIconifyClient(iconify, fake.impl);
    await expect(client.search('tree', 10, null)).rejects.toMatchObject({
      status: 429,
      body: { error: 'iconify_rate_limited' },
      retryAfter: 7,
    });
  });

  it('falls back to a default Retry-After when upstream names none', async () => {
    const fake = fakeIconify({ collections: () => new Response('', { status: 429 }) });
    const client = createIconifyClient(iconify, fake.impl);
    await expect(client.search('tree', 10, null)).rejects.toMatchObject({
      status: 429,
      retryAfter: expect.any(Number),
    });
  });

  it('stays off the upstream while it is rate-limiting us', async () => {
    let t = 1_000;
    const fake = fakeIconify({
      collections: () => new Response('', { status: 429, headers: { 'retry-after': '10' } }),
    });
    const client = createIconifyClient(iconify, fake.impl, () => t);
    await expect(client.search('tree', 10, null)).rejects.toMatchObject({ status: 429 });
    const before = fake.calls.length;
    t += 3_000;
    await expect(client.search('house', 10, null)).rejects.toMatchObject({
      status: 429,
      retryAfter: 7,
    });
    expect(fake.calls.length).toBe(before);
    t += 8_000;
    await expect(client.search('house', 10, null)).rejects.toMatchObject({ status: 429 });
    expect(fake.calls.length).toBeGreaterThan(before);
  });

  it('fetches the icons of a search in one batch per set, not one request per icon', async () => {
    const fake = fakeIconify({
      search: ['tabler:tree', 'tabler:house', 'ri:tree-line', 'lets:tree'],
      batch: batchAnswer,
    });
    const client = createIconifyClient(iconify, fake.impl);
    await client.search('tree', 10, null);
    const batches = fake.calls.filter((c) => /^\/[a-z0-9-]+\.json/.test(c));
    expect(batches).toHaveLength(3);
    const tabler = batches.find((c) => c.startsWith('/tabler.json'))!;
    expect(new URL(`http://x${tabler}`).searchParams.get('icons')).toBe('tree,house');
    // The tiles then come from the cache, sanitised like any other icon.
    const svg = await client.svg('tabler', 'tree');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('<path');
    expect(fake.calls.filter((c) => c.endsWith('.svg'))).toEqual([]);
  });

  it('still serves an icon singly when the batch did not cover it', async () => {
    const fake = fakeIconify({ search: ['tabler:tree'] });
    const client = createIconifyClient(iconify, fake.impl);
    await client.search('tree', 10, null);
    await client.svg('tabler', 'tree');
    expect(fake.calls.filter((c) => c.endsWith('.svg'))).toEqual(['/tabler/tree.svg']);
  });

  it('ignores a failing batch: the search itself still answers', async () => {
    const fake = fakeIconify({
      search: ['tabler:tree'],
      batch: () => new Response('', { status: 429 }),
    });
    const client = createIconifyClient(iconify, fake.impl);
    const result = await client.search('tree', 10, null);
    expect(result.icons).toHaveLength(1);
  });

  it('batches heavy sets in chunks that fit, instead of falling back to one request per icon', async () => {
    const names = Array.from({ length: 40 }, (_, i) => `icon-${i}`);
    const fat = '<path d="' + 'M0 0h1'.repeat(3500) + '"/>';
    const fake = fakeIconify({
      search: names.map((n) => `tabler:${n}`),
      batch: (prefix, url) =>
        Response.json({
          prefix,
          width: 24,
          height: 24,
          icons: Object.fromEntries(
            (url.searchParams.get('icons') ?? '').split(',').map((n) => [n, { body: fat }])
          ),
        }),
    });
    const client = createIconifyClient(iconify, fake.impl);
    await client.search('tree', 64, null);
    const batches = fake.calls.filter((c) => /^\/tabler\.json/.test(c));
    expect(batches).toHaveLength(3);
    for (const c of batches) {
      expect(
        new URL(`http://x${c}`).searchParams.get('icons')!.split(',').length
      ).toBeLessThanOrEqual(16);
    }
    await client.svg('tabler', 'icon-39');
    expect(fake.calls.filter((c) => c.endsWith('.svg'))).toEqual([]);
  });

  it('ignores a batch answer over the chunk cap', async () => {
    const fake = fakeIconify({
      search: ['tabler:tree'],
      batch: () =>
        new Response(new ReadableStream({ pull: (c) => c.enqueue(new Uint8Array(512 * 1024)) })),
    });
    const client = createIconifyClient(iconify, fake.impl);
    await expect(client.search('tree', 10, null)).resolves.toMatchObject({
      icons: [expect.anything()],
    });
  });

  it('fetches the missing icons in batches when a cached search is repeated', async () => {
    let failBatch = true;
    const fake = fakeIconify({
      search: ['tabler:tree', 'tabler:house'],
      batch: (prefix, url) =>
        failBatch ? new Response('', { status: 500 }) : batchAnswer(prefix, url),
    });
    const client = createIconifyClient(iconify, fake.impl);
    await client.search('tree', 10, null);
    failBatch = false;
    await client.search('tree', 10, null, { refresh: true });
    await client.svg('tabler', 'house');
    expect(fake.calls.filter((c) => c.endsWith('.svg'))).toEqual([]);
    expect(fake.calls.filter((c) => c.startsWith('/search'))).toHaveLength(1);
  });

  it('never holds more than the total batch budget at once', async () => {
    // 20 sets, one name each: every chunk may read up to 64 KB; all start together.
    const prefixes = Array.from({ length: 80 }, (_, i) => `set${i}`);
    const collections = Object.fromEntries(prefixes.map((p) => [p, set(p, 'MIT')]));
    let open = 0;
    let peakCap = 0;
    const fat = '<path d="' + 'M0 0h1'.repeat(10000) + '"/>';
    const fake = fakeIconify({
      collections: () => Response.json(collections),
      search: prefixes.map((p) => `${p}:a`),
    });
    const inner = fake.impl.getMockImplementation()!;
    const impl = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (/^\/set\d+\.json$/.test(url.pathname)) {
        open += 1;
        // Each in-flight chunk holds at most its reservation; the body here is ~60 KB.
        peakCap = Math.max(peakCap, open * 60_000);
        await new Promise((r) => setTimeout(r, 5));
        open -= 1;
        return Response.json({
          width: 24,
          height: 24,
          icons: { a: { body: fat } },
        });
      }
      return inner(input, init);
    });
    const client = createIconifyClient(iconify, impl);
    await client.search('tree', 80, null);
    // 4 MB budget / 64 KB per single-name chunk = at most 64 concurrent requests.
    expect(peakCap / 60_000).toBeLessThanOrEqual(64);
  });

  it('does not ask the upstream again for names it said it cannot batch', async () => {
    const fake = fakeIconify({
      search: ['tabler:tree', 'tabler:ghost'],
      // `ghost` is not in the answer: unbatchable. `tree` is.
      batch: (prefix) =>
        Response.json({
          prefix,
          width: 24,
          height: 24,
          icons: { tree: { body: '<path d="M0 0h1"/>' } },
        }),
    });
    const client = createIconifyClient(iconify, fake.impl);
    await client.search('tree', 10, null);
    expect(fake.calls.filter((c) => /^\/tabler\.json/.test(c))).toHaveLength(1);
    await client.search('tree', 10, null);
    await new Promise((r) => setTimeout(r, 20));
    expect(fake.calls.filter((c) => /^\/tabler\.json/.test(c))).toHaveLength(1);
  });

  it('answers a cached search without waiting for the upstream', async () => {
    let failBatch = true;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const fake = fakeIconify({ search: ['tabler:tree'] });
    const inner = fake.impl.getMockImplementation()!;
    const impl = vi.fn<typeof fetch>(async (input, init) => {
      if (/\.json/.test(String(input))) {
        if (failBatch) return new Response('', { status: 500 });
        await gate;
        return batchAnswer('tabler', new URL(String(input)));
      }
      return inner(input, init);
    });
    const client = createIconifyClient(iconify, impl);
    await client.search('tree', 10, null);
    failBatch = false;
    // Resolves although the batch is still blocked.
    await expect(client.search('tree', 10, null)).resolves.toMatchObject({
      icons: [expect.anything()],
    });
    release();
  });

  it('reports the cooldown the upstream asked for', async () => {
    let t = 1_000;
    const fake = fakeIconify({
      search: ['tabler:tree'],
      batch: () => new Response('', { status: 429, headers: { 'retry-after': '9' } }),
    });
    const client = createIconifyClient(iconify, fake.impl, () => t);
    expect(client.cooldownSeconds()).toBe(0);
    await client.search('tree', 10, null);
    expect(client.cooldownSeconds()).toBe(9);
    t += 4_000;
    expect(client.cooldownSeconds()).toBe(5);
  });
});
