// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Organisation isolation: every route, called by the owner of organisation B against
 * organisation A's projects, uploads, members, invitations and brand pack, must answer
 * 404 and change nothing. Needs a real Postgres (DATABASE_URL).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import {
  BRAND_SETTINGS,
  type Client,
  DEFAULT_ORG,
  otherOrganisation,
  PNG_1X1,
  resetDb,
  setupAdmin,
  testConfig,
  WOFF2,
} from './helpers.ts';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('organisation isolation (Postgres)', () => {
  const config = testConfig();
  const { pool, db } = createDb(config.databaseUrl);
  // A fresh app per test: the login rate limits start from zero.
  let app = createApp({ config, db });
  let alice: Client;
  let bob: Client;
  const a = {
    org: DEFAULT_ORG,
    project: '',
    upload: '',
    logo: { id: '', url: '' },
    font: { id: '', url: '' },
    invitation: '',
  };

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await resetDb(pool);
    app = createApp({ config, db });
    alice = await setupAdmin(app, 'alice@example.org');
    bob = await otherOrganisation(app, alice, 'bob@example.org');
    const project = await alice.post(`/api/orgs/${a.org}/projects`).send({ name: 'A' }).expect(201);
    a.project = project.body.id;
    await alice
      .put(`/api/projects/${a.project}/thumbnail`)
      .set('content-type', 'image/png')
      .send(PNG_1X1)
      .expect(200);
    const upload = await alice
      .post(`/api/orgs/${a.org}/uploads`)
      .attach('file', PNG_1X1, 'a.png')
      .expect(201);
    a.upload = upload.body.url;
    a.logo = (
      await alice
        .post(`/api/orgs/${a.org}/brand-pack/logo`)
        .attach('file', PNG_1X1, 'l.png')
        .expect(201)
    ).body;
    a.font = (
      await alice
        .post(`/api/orgs/${a.org}/brand-pack/fonts`)
        .field('family', 'Alice Sans')
        .field('licence', 'OFL-1.1')
        .attach('file', WOFF2, 'f.woff2')
        .expect(201)
    ).body;
    await alice.put(`/api/orgs/${a.org}/brand-pack`).send(BRAND_SETTINGS).expect(200);
    a.invitation = (
      await alice.post(`/api/orgs/${a.org}/invitations`).send({}).expect(201)
    ).body.id;
  });
  afterAll(async () => {
    await pool.end();
  });

  const attempts: [string, (c: Client) => Promise<{ status: number }>][] = [
    ['list projects', (c) => c.get(`/api/orgs/${a.org}/projects`)],
    ['create a project', (c) => c.post(`/api/orgs/${a.org}/projects`).send({ name: 'x' })],
    ['read a project', (c) => c.get(`/api/projects/${a.project}`)],
    [
      'rename a project',
      (c) => c.patch(`/api/projects/${a.project}`).send({ version: 1, name: 'x' }),
    ],
    ['delete a project', (c) => c.delete(`/api/projects/${a.project}`)],
    ['read a thumbnail', (c) => c.get(`/api/projects/${a.project}/thumbnail`)],
    [
      'write a thumbnail',
      (c) =>
        c
          .put(`/api/projects/${a.project}/thumbnail`)
          .set('content-type', 'image/png')
          .send(PNG_1X1),
    ],
    ['upload', (c) => c.post(`/api/orgs/${a.org}/uploads`).attach('file', PNG_1X1, 'x.png')],
    ['read an upload', (c) => c.get(a.upload)],
    ['list members', (c) => c.get(`/api/orgs/${a.org}/members`)],
    [
      'change a role',
      (c) => c.patch(`/api/orgs/${a.org}/members/${alice.accountId}`).send({ role: 'editor' }),
    ],
    ['remove a member', (c) => c.delete(`/api/orgs/${a.org}/members/${alice.accountId}`)],
    [
      'join by adding oneself',
      (c) => c.patch(`/api/orgs/${a.org}/members/${c.accountId}`).send({ role: 'owner' }),
    ],
    ['list invitations', (c) => c.get(`/api/orgs/${a.org}/invitations`)],
    ['create an invitation', (c) => c.post(`/api/orgs/${a.org}/invitations`).send({})],
    ['revoke an invitation', (c) => c.delete(`/api/orgs/${a.org}/invitations/${a.invitation}`)],
    ['read the brand pack', (c) => c.get(`/api/orgs/${a.org}/brand-pack`)],
    ['write the brand pack', (c) => c.put(`/api/orgs/${a.org}/brand-pack`).send(BRAND_SETTINGS)],
    [
      'upload a logo',
      (c) => c.post(`/api/orgs/${a.org}/brand-pack/logo`).attach('file', PNG_1X1, 'l.png'),
    ],
    [
      'upload a font',
      (c) =>
        c
          .post(`/api/orgs/${a.org}/brand-pack/fonts`)
          .field('family', 'X')
          .field('licence', 'OFL-1.1')
          .attach('file', WOFF2, 'f.woff2'),
    ],
    ['delete a brand asset', (c) => c.delete(`/api/orgs/${a.org}/brand-pack/assets/${a.logo.id}`)],
    [
      'delete a brand asset through the own organisation',
      (c) => c.delete(`/api/orgs/${c.orgId}/brand-pack/assets/${a.font.id}`),
    ],
    ['read the logo file', (c) => c.get(a.logo.url)],
    ['read the font file', (c) => c.get(a.font.url)],
  ];

  it.each(attempts)('a member of another organisation cannot %s', async (_name, attempt) => {
    const before = await snapshot();
    const res = await attempt(bob);
    expect(res.status).toBe(404);
    expect(await snapshot()).toEqual(before);
  });

  it('a member of another organisation cannot point its brand at a foreign logo', async () => {
    await bob
      .put(`/api/orgs/${bob.orgId}/brand-pack`)
      .send({ ...BRAND_SETTINGS, logoAssetId: a.logo.id })
      .expect(400);
    await bob
      .put(`/api/orgs/${bob.orgId}/brand-pack`)
      .send({ ...BRAND_SETTINGS, fonts: { headline: 'Alice Sans', body: 'PT Sans' } })
      .expect(400);
  });

  it('keeps lists apart and still lets each owner work in their own organisation', async () => {
    const created = await bob
      .post(`/api/orgs/${bob.orgId}/projects`)
      .send({ name: 'B' })
      .expect(201);
    expect(created.body.organisationId).toBe(bob.orgId);
    const bobList = await bob.get(`/api/orgs/${bob.orgId}/projects`).expect(200);
    expect(bobList.body.projects.map((p: { name: string }) => p.name)).toEqual(['B']);
    const aliceList = await alice.get(`/api/orgs/${a.org}/projects`).expect(200);
    expect(aliceList.body.projects.map((p: { name: string }) => p.name)).toEqual(['A']);
    // Alice left Bob's organisation in otherOrganisation(): she sees nothing of it.
    await alice.get(`/api/projects/${created.body.id}`).expect(404);
    const session = await bob.get('/api/auth/session').expect(200);
    expect(session.body.organisations.map((o: { id: string }) => o.id)).toEqual([bob.orgId]);
  });

  /** Everything a foreign call could change, plus the files on disk being readable. */
  async function snapshot() {
    const tables = [
      'SELECT id, name, version, organisation_id FROM projects ORDER BY id',
      'SELECT project_id, md5(png) FROM project_thumbnails ORDER BY project_id',
      'SELECT file_name, organisation_id FROM uploads ORDER BY file_name',
      'SELECT organisation_id, account_id, role FROM memberships ORDER BY organisation_id, account_id',
      'SELECT id, accepted_at FROM invitations ORDER BY id',
      'SELECT organisation_id, name, colors, logo_asset_id FROM brand_packs ORDER BY organisation_id',
      'SELECT id, organisation_id, file_name FROM brand_assets ORDER BY id',
    ];
    const out: unknown[] = [];
    for (const q of tables) out.push((await pool.query(q)).rows);
    out.push((await alice.get(a.logo.url)).status, (await alice.get(a.font.url)).status);
    return out;
  }
});
