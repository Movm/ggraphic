// SPDX-License-Identifier: AGPL-3.0-only
// Brand pack routes as owner and editor. Needs a real Postgres (DATABASE_URL).
import { readdirSync } from 'node:fs';
import { contrastRatio, deriveBrandColors, deriveGrounds } from '@ggraphic/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
      expect(res.body.settings.fonts).toEqual(BRAND_SETTINGS.fonts);
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

  it('accepts the replaced font families and stores their successors', async () => {
    const res = await owner
      .put(base)
      .send({ ...BRAND_SETTINGS, fonts: { headline: 'PT Sans', body: 'Vollkorn' } })
      .expect(200);
    expect(res.body.settings.fonts).toEqual({ headline: 'Instrument Sans', body: 'Fraunces' });
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
