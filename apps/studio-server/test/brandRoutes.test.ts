// SPDX-License-Identifier: AGPL-3.0-only
// Brand pack routes as owner and editor. Needs a real Postgres (DATABASE_URL).
import { readdirSync, rmSync } from 'node:fs';
import { contrastRatio, deriveBrandColors, deriveGrounds } from '@ggraphic/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { assetDir } from '../src/routes/brand.ts';
import {
  BRAND_SETTINGS,
  type Client,
  DEFAULT_ORG,
  memberOf,
  PNG_1X1,
  resetDb,
  setupAdmin,
  testConfig,
  WOFF2,
} from './helpers.ts';

const hasDb = Boolean(process.env['DATABASE_URL']);
const base = `/api/orgs/${DEFAULT_ORG}/brand-pack`;

describe.skipIf(!hasDb)('brand packs (Postgres)', () => {
  const config = testConfig({ fontMaxBytes: 1024 });
  const { pool, db } = createDb(config.databaseUrl);
  // A fresh app per test: the login rate limits start from zero.
  let app = createApp({ config, db });
  let owner: Client;
  let editor: Client;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await resetDb(pool);
    app = createApp({ config, db });
    owner = await setupAdmin(app);
    editor = await memberOf(app, pool, DEFAULT_ORG, 'ed@example.org');
  });
  afterAll(async () => {
    await pool.end();
  });

  const uploadFont = (fields: Record<string, string>, file: Buffer = WOFF2) => {
    let req = owner.post(`${base}/fonts`);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', file, 'font.woff2');
  };

  it('has no pack until an owner saves one', async () => {
    const res = await editor.get(base).expect(200);
    expect(res.body).toMatchObject({ settings: null, assets: [], pack: null });
    expect(res.body.bundledFonts).toEqual(['Raleway', 'Instrument Sans', 'Fraunces']);
  });

  it('saves settings, builds the pack and lets editors read but not write', async () => {
    const saved = await owner.put(base).send(BRAND_SETTINGS).expect(200);
    expect(saved.body.pack).toMatchObject({ id: `org-${DEFAULT_ORG}`, name: 'Example' });
    expect(saved.body.pack.colors.secondary).toBe('#ABCDEF');
    const read = await editor.get(base).expect(200);
    expect(read.body.pack).toEqual(saved.body.pack);
    await editor.put(base).send(BRAND_SETTINGS).expect(403);
    await editor.post(`${base}/logo`).attach('file', PNG_1X1, 'l.png').expect(403);
    await editor
      .post(`${base}/fonts`)
      .field('family', 'X')
      .field('licence', 'OFL-1.1')
      .attach('file', WOFF2, 'f.woff2')
      .expect(403);
  });

  describe('three colours', () => {
    const THREE = { primary: '#123456', secondary: '#abcdef', accent: '#ffcc00' };
    const three = (colors: Record<string, string> = THREE) => ({
      name: 'Example',
      colors,
      fonts: BRAND_SETTINGS.fonts,
    });

    it('derives and stores all eight roles and the grounds', async () => {
      const res = await owner.put(base).send(three()).expect(200);
      const expected = deriveBrandColors(THREE)!;
      const stored = res.body.settings.colors as Record<string, string>;
      expect(Object.keys(stored).sort()).toEqual(Object.keys(expected).sort());
      for (const [role, value] of Object.entries(expected)) {
        expect(stored[role], role).toBe(value.toUpperCase());
      }
      expect(res.body.settings.backgrounds).toEqual(
        deriveGrounds(THREE).map((g) => ({
          label: g.label,
          color: g.color.toUpperCase(),
          ink: g.ink.toUpperCase(),
        }))
      );
      expect(res.body.settings.backgrounds.length).toBeGreaterThan(0);
      // The pack still offers the roles as binding refs (a role equal to an earlier one is
      // listed once), so saved designs resolve.
      const refs = (res.body.pack.palette as { ref?: string }[]).map((s) => s.ref);
      expect(refs).toEqual(
        expect.arrayContaining([
          'brand.primary',
          'brand.secondary',
          'brand.accent',
          'brand.surface',
          'brand.attention',
        ])
      );
      expect(res.body.pack.defaultBackground).toBe('#123456');
    });

    it.each([
      ['dark blue', { primary: '#123456', secondary: '#abcdef', accent: '#ffcc00' }],
      ['light yellow', { primary: '#fff3a0', secondary: '#2e7d32', accent: '#e91e63' }],
      ['mid grey', { primary: '#888888', secondary: '#999999', accent: '#aaaaaa' }],
      ['saturated red', { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff' }],
      ['green', { primary: '#46962b', secondary: '#f5f1e9', accent: '#ffe000' }],
      ['white', { primary: '#ffffff', secondary: '#ffffff', accent: '#ffffff' }],
      ['black', { primary: '#000000', secondary: '#000000', accent: '#000000' }],
    ])('meets the contrast checks for %s', async (_name, colors) => {
      const res = await owner.put(base).send(three(colors)).expect(200);
      const c = res.body.settings.colors as Record<string, string>;
      const ratio = (a: string, b: string) => contrastRatio(a, b) ?? 0;
      expect(ratio(c['textOnLight']!, c['surface']!)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c['textOnDark']!, c['primary']!)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c['accentOnLight']!, c['surface']!)).toBeGreaterThanOrEqual(3);
      expect(ratio(c['attention']!, c['surface']!)).toBeGreaterThanOrEqual(4.5);
      for (const g of res.body.settings.backgrounds as { color: string; ink: string }[]) {
        expect(ratio(g.ink, g.color)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('still accepts the full legacy body and derives the roles it names', async () => {
      const res = await owner.put(base).send(BRAND_SETTINGS).expect(200);
      const c = res.body.settings.colors as Record<string, string>;
      expect(c['primary']).toBe('#123456');
      expect(c['secondary']).toBe('#ABCDEF');
      expect(c['accent']).toBe('#FFCC00');
      // The hand-set surface of the old body is replaced by the derived one.
      expect(c['surface']).toBe(deriveBrandColors(BRAND_SETTINGS.colors)!.surface.toUpperCase());
      expect(res.body.settings.backgrounds).toHaveLength(
        deriveGrounds(BRAND_SETTINGS.colors).length
      );
      expect(res.body.settings.fonts).toEqual({
        ...BRAND_SETTINGS.fonts,
        serif: null,
        condensed: null,
      });
    });

    it('answers 400 for an invalid or missing colour', async () => {
      for (const colors of [
        { ...THREE, primary: 'red' },
        { ...THREE, accent: '#12345' },
        { primary: THREE.primary, secondary: THREE.secondary },
        { ...THREE, surface: '#ffffff' },
      ]) {
        await owner.put(base).send(three(colors)).expect(400);
      }
      await owner.get(base).expect(200);
      expect((await owner.get(base)).body.settings).toBeNull();
    });

    it('keeps the owner-only rule and the font and logo checks', async () => {
      await editor.put(base).send(three()).expect(403);
      await owner
        .put(base)
        .send({ ...three(), fonts: { headline: 'Unknown Sans', body: 'Instrument Sans' } })
        .expect(400);
      await owner
        .put(base)
        .send({ ...three(), logoAssetId: '00000000-0000-4000-8000-00000000abcd' })
        .expect(400);
    });
  });

  describe('layout, fonts and the second logo', () => {
    // The asset directory is shared by the file's tests; leave it as found.
    afterEach(() => rmSync(assetDir(config), { recursive: true, force: true }));

    const NEW = {
      fonts: {
        headline: 'Raleway',
        body: 'Instrument Sans',
        serif: 'Fraunces',
        condensed: 'Raleway',
      },
      layout: { margin: 0.06, logoCorner: 'top-left', logoMaxWidth: 0.3, logoMaxHeight: 0.1 },
    };
    const uploadLogo = async () =>
      (await owner.post(`${base}/logo`).attach('file', PNG_1X1, 'l.png').expect(201)).body;

    it('answers 400 for a logo box over 30 × 12 percent', async () => {
      for (const layout of [
        { ...NEW.layout, logoMaxWidth: 0.35 },
        { ...NEW.layout, logoMaxHeight: 0.13 },
      ]) {
        await owner
          .put(base)
          .send({ ...BRAND_SETTINGS, layout })
          .expect(400);
      }
    });

    it('reads a stored 0.4 × 0.2 layout clamped to 0.30 × 0.12, never rejected', async () => {
      await owner
        .put(base)
        .send({ ...BRAND_SETTINGS, ...NEW })
        .expect(200);
      await pool.query('update brand_packs set layout = $1', [
        JSON.stringify({ ...NEW.layout, logoMaxWidth: 0.4, logoMaxHeight: 0.2 }),
      ]);
      const read = await editor.get(base).expect(200);
      const clamped = { ...NEW.layout, logoMaxWidth: 0.3, logoMaxHeight: 0.12 };
      expect(read.body.settings.layout).toEqual(clamped);
      expect(read.body.pack.layout).toEqual(clamped);
    });

    it('round-trip through PUT and GET', async () => {
      const alt = await uploadLogo();
      const saved = await owner
        .put(base)
        .send({ ...BRAND_SETTINGS, ...NEW, logoAlt: { assetId: alt.id, ground: 'light' } })
        .expect(200);
      expect(saved.body.settings).toMatchObject({
        ...NEW,
        logoAlt: { assetId: alt.id, ground: 'light' },
      });
      expect(saved.body.pack).toMatchObject({
        layout: NEW.layout,
        fonts: { serif: 'Fraunces', condensed: 'Raleway' },
        logoAlt: { src: alt.url, label: 'Example logo (alternative)', ground: 'light' },
      });
      const read = await editor.get(base).expect(200);
      expect(read.body).toEqual(saved.body);
      // The three-colour body carries them too.
      const three = await owner
        .put(base)
        .send({
          name: 'Example',
          colors: { primary: '#123456', secondary: '#abcdef', accent: '#ffcc00' },
          ...NEW,
          logoAlt: { assetId: alt.id, ground: 'dark' },
        })
        .expect(200);
      expect(three.body.settings).toMatchObject({ ...NEW, logoAlt: { ground: 'dark' } });
      // An explicit null clears them.
      const cleared = await owner
        .put(base)
        .send({
          ...BRAND_SETTINGS,
          fonts: { ...BRAND_SETTINGS.fonts, serif: null, condensed: null },
          logoAlt: null,
          layout: null,
        })
        .expect(200);
      expect(cleared.body.settings).toMatchObject({ layout: null, logoAlt: null });
      expect(cleared.body.pack).not.toHaveProperty('layout');
      expect(cleared.body.pack).not.toHaveProperty('logoAlt');
    });

    describe('a body from an older client (keys missing)', () => {
      const oldShape = (extra: Record<string, unknown> = {}) => ({
        name: 'Example',
        colors: { primary: '#123456', secondary: '#abcdef', accent: '#ffcc00' },
        fonts: { headline: 'Raleway', body: 'Instrument Sans' },
        ...extra,
      });

      it.each([
        ['three-colour body', () => oldShape({ logoAssetId: null })],
        ['full body', () => ({ ...BRAND_SETTINGS, name: 'Renamed' })],
      ])('keeps the stored layout, logoAlt, serif and condensed (%s)', async (_label, body) => {
        const alt = await uploadLogo();
        await owner
          .put(base)
          .send(oldShape({ ...NEW, logoAlt: { assetId: alt.id, ground: 'light' } }))
          .expect(200);
        const res = await owner.put(base).send(body()).expect(200);
        expect(res.body.settings).toMatchObject({
          ...NEW,
          logoAlt: { assetId: alt.id, ground: 'light' },
        });
        expect(res.body.pack.fonts).toMatchObject({ serif: 'Fraunces', condensed: 'Raleway' });
      });

      it('clears each one only on an explicit null', async () => {
        const alt = await uploadLogo();
        await owner
          .put(base)
          .send(oldShape({ ...NEW, logoAlt: { assetId: alt.id, ground: 'light' } }))
          .expect(200);
        const res = await owner
          .put(base)
          .send(
            oldShape({
              fonts: { ...NEW.fonts, serif: null },
              layout: null,
            })
          )
          .expect(200);
        expect(res.body.settings.fonts).toMatchObject({ serif: null, condensed: 'Raleway' });
        expect(res.body.settings.layout).toBeNull();
        expect(res.body.settings.logoAlt).toMatchObject({ assetId: alt.id });
        const cleared = await owner
          .put(base)
          .send(oldShape({ ...NEW, logoAlt: null }))
          .expect(200);
        expect(cleared.body.settings.logoAlt).toBeNull();
      });

      it('drops a kept serif or condensed whose font asset was deleted, instead of a 400', async () => {
        await owner
          .put(base)
          .send(oldShape({ fonts: { ...NEW.fonts, serif: 'Gone Serif' } }))
          .expect(400);
        const font = (
          await owner
            .post(`${base}/fonts`)
            .field('family', 'Gone Serif')
            .field('licence', 'OFL-1.1')
            .attach('file', WOFF2, 'f.woff2')
            .expect(201)
        ).body;
        await owner
          .put(base)
          .send(oldShape({ fonts: { ...NEW.fonts, serif: 'Gone Serif' } }))
          .expect(200);
        await owner.delete(`${base}/assets/${font.id}`).expect(204);
        const res = await owner.put(base).send(oldShape()).expect(200);
        expect(res.body.settings.fonts).toMatchObject({ serif: null, condensed: 'Raleway' });
      });

      it('does not write stale kept values over a save that committed meanwhile (row lock)', async () => {
        const alt = await uploadLogo();
        await owner
          .put(base)
          .send(oldShape({ ...NEW, logoAlt: { assetId: alt.id, ground: 'light' } }))
          .expect(200);
        const next = { ...NEW.layout, margin: 0.08 };
        // The test holds brand_assets, so the old-shape PUT stops right after it read the
        // stored row (it reads the assets second).
        const holder = await pool.connect();
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        try {
          await holder.query('begin');
          await holder.query('lock table brand_assets in access exclusive mode');
          // superagent sends on `then`: start it now.
          const stale = owner
            .put(base)
            .send(oldShape({ name: 'Old client' }))
            .then((r) => r);
          const blocked = async () => {
            for (let i = 0; i < 100; i++) {
              const { rows } = await pool.query(
                "select 1 from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%brand_assets%'"
              );
              if (rows.length > 0) return;
              await sleep(20);
            }
            throw new Error('the PUT never reached brand_assets');
          };
          await blocked();
          // Another save sets a new layout. Under the row lock it has to wait for the PUT.
          const newer = pool.query('update brand_packs set layout = $1', [JSON.stringify(next)]);
          await Promise.race([newer, sleep(300)]);
          await holder.query('rollback');
          const [res] = await Promise.all([stale, newer]);
          expect(res.status).toBe(200);
        } finally {
          holder.release();
        }
        const read = await owner.get(base).expect(200);
        expect(read.body.settings.layout).toEqual(next);
      });

      it('aliases a stored legacy family before checking it, instead of dropping it', async () => {
        await owner.put(base).send(oldShape(NEW)).expect(200);
        await pool.query(
          "update brand_packs set fonts = jsonb_set(fonts, '{serif}', '\"PT Sans\"')"
        );
        const res = await owner.put(base).send(oldShape()).expect(200);
        expect(res.body.settings.fonts.serif).toBe('Instrument Sans');
      });

      it('has nothing to keep on a first save', async () => {
        const res = await owner.put(base).send(oldShape()).expect(200);
        expect(res.body.settings).toMatchObject({ layout: null, logoAlt: null });
        expect(res.body.settings.fonts).toMatchObject({ serif: null, condensed: null });
      });
    });

    it.each([
      ['margin 0.5', { layout: { ...NEW.layout, margin: 0.5 } }],
      ['logoCorner middle', { layout: { ...NEW.layout, logoCorner: 'middle' } }],
      [
        'logoAlt.ground grey',
        { logoAlt: { assetId: '00000000-0000-4000-8000-00000000abcd', ground: 'grey' } },
      ],
    ])('rejects %s with 400', async (_n, extra) => {
      await owner
        .put(base)
        .send({ ...BRAND_SETTINGS, ...extra })
        .expect(400);
    });

    it('rejects a logoAlt asset of another organisation or of kind font with 400', async () => {
      const font = (await uploadFont({ family: 'Mine', licence: 'OFL-1.1' }).expect(201)).body;
      await owner
        .put(base)
        .send({ ...BRAND_SETTINGS, logoAlt: { assetId: font.id, ground: 'dark' } })
        .expect(400);
      const { rows } = await pool.query(
        "INSERT INTO organisations (name) VALUES ('other') RETURNING id"
      );
      const { rows: foreign } = await pool.query(
        "INSERT INTO brand_assets (organisation_id, kind, file_name, content_type, size) VALUES ($1, 'logo', $2, 'image/png', 1) RETURNING id",
        [rows[0].id, `${'d'.repeat(32)}.png`]
      );
      const res = await owner
        .put(base)
        .send({ ...BRAND_SETTINGS, logoAlt: { assetId: foreign[0].id, ground: 'dark' } })
        .expect(400);
      expect(res.body.message).toContain('logoAlt');
    });

    it('deleting the second logo asset clears it from the pack', async () => {
      const alt = await uploadLogo();
      await owner
        .put(base)
        .send({ ...BRAND_SETTINGS, logoAlt: { assetId: alt.id, ground: 'dark' } })
        .expect(200);
      await owner.delete(`${base}/assets/${alt.id}`).expect(204);
      const read = (await owner.get(base).expect(200)).body;
      expect(read.settings.logoAlt).toBeNull();
      expect(read.pack).not.toHaveProperty('logoAlt');
    });
  });

  it('accepts the replaced font families and stores their successors', async () => {
    const res = await owner
      .put(base)
      .send({ ...BRAND_SETTINGS, fonts: { headline: 'PT Sans', body: 'Vollkorn' } })
      .expect(200);
    expect(res.body.settings.fonts).toEqual({
      headline: 'Instrument Sans',
      body: 'Fraunces',
      serif: null,
      condensed: null,
    });
  });

  it('validates colours and font families', async () => {
    await owner
      .put(base)
      .send({ ...BRAND_SETTINGS, colors: { ...BRAND_SETTINGS.colors, primary: 'red' } })
      .expect(400);
    const unknown = await owner
      .put(base)
      .send({ ...BRAND_SETTINGS, fonts: { headline: 'Unknown Sans', body: 'Instrument Sans' } })
      .expect(400);
    expect(unknown.body.message).toContain('Unknown Sans');
  });

  it('stores a logo, refuses SVG and serves it to members', async () => {
    const svg = await owner
      .post(`${base}/logo`)
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'logo.svg')
      .expect(415);
    expect(svg.body.message).toContain('SVG');
    const logo = await owner.post(`${base}/logo`).attach('file', PNG_1X1, '../x.png').expect(201);
    expect(logo.body).toMatchObject({ kind: 'logo', contentType: 'image/png' });
    expect(logo.body.url).toMatch(/^\/api\/brand-assets\/[0-9a-f]{32}\.png$/);
    const saved = await owner
      .put(base)
      .send({ ...BRAND_SETTINGS, logoAssetId: logo.body.id })
      .expect(200);
    expect(saved.body.pack.logo).toEqual({ src: logo.body.url, label: 'Example logo' });
    const file = await editor.get(logo.body.url).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['cross-origin-resource-policy']).toBe('same-origin');
    await owner.delete(`${base}/assets/${logo.body.id}`).expect(204);
    await editor.get(logo.body.url).expect(404);
    expect((await owner.get(base)).body.pack.logo).toBeNull();
  });

  it('requires a licence for fonts, sniffs them and serves them as fonts', async () => {
    const noLicence = await uploadFont({ family: 'Mine' }).expect(400);
    expect(noLicence.body.message).toContain('licence');
    await uploadFont({ family: 'Mine', licence: 'OFL-1.1' }, PNG_1X1).expect(415);
    await uploadFont(
      { family: 'Mine', licence: 'OFL-1.1' },
      Buffer.concat([WOFF2, Buffer.alloc(2048)])
    ).expect(413);
    await uploadFont({ family: 'Mi"ne', licence: 'OFL-1.1' }).expect(400);
    const font = await uploadFont({ family: 'Mine', licence: 'own licence', weight: '700' }).expect(
      201
    );
    expect(font.body).toMatchObject({
      kind: 'font',
      contentType: 'font/woff2',
      family: 'Mine',
      weight: 700,
      style: 'normal',
      licence: 'own licence',
    });
    const served = await editor.get(font.body.url).expect(200);
    expect(served.headers['content-type']).toBe('font/woff2');
    const saved = await owner
      .put(base)
      .send({ ...BRAND_SETTINGS, fonts: { headline: 'Mine', body: 'Instrument Sans' } })
      .expect(200);
    expect(saved.body.pack.fonts.headline).toBe('Mine');
    expect(saved.body.pack.fontFaces).toEqual([
      { family: 'Mine', src: font.body.url, weight: 700, style: 'normal' },
    ]);
    const { rows } = await pool.query('SELECT licence FROM brand_assets');
    expect(rows).toEqual([{ licence: 'own licence' }]);
    expect(readdirSync(assetDir(config))).toEqual([font.body.url.split('/').pop()]);
  });

  it.each(['..%2F..%2Fpackage.json', `${'a'.repeat(32)}.woff2`, `${'a'.repeat(32)}.svg`])(
    'answers 404 for the asset name %s',
    async (name) => {
      await owner.get(`/api/brand-assets/${name}`).expect(404);
    }
  );
});
