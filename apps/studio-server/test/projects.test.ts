// SPDX-License-Identifier: AGPL-3.0-only
// Needs a real Postgres: DATABASE_URL=postgres://... pnpm test. Skipped otherwise.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { type Client, PASSWORD, PNG_1X1, resetDb, setupAdmin, testConfig } from './helpers.ts';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('projects (Postgres)', () => {
  const config = testConfig({ ai: null });
  const { pool, db } = createDb(config.databaseUrl);
  // A fresh app per test: the setup token is single use.
  let app = createApp({ config, db });

  beforeAll(async () => {
    await runMigrations(pool);
  });
  let admin: Client;
  let list: string;
  beforeEach(async () => {
    await resetDb(pool);
    app = createApp({ config, db });
    admin = await setupAdmin(app);
    list = `/api/orgs/${admin.orgId}/projects`;
  });
  afterAll(async () => {
    await pool.end();
  });

  it('migrations are idempotent', async () => {
    expect(await runMigrations(pool)).toEqual([]);
  });

  it('reports health', async () => {
    expect((await request(app).get('/healthz').expect(200)).body).toEqual({ status: 'ok' });
  });

  it('creates, lists, loads, renames and deletes', async () => {
    const created = await admin
      .post(list)
      .send({ name: 'Plakat', document: { pages: [] }, schemaVersion: 2 })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Plakat',
      document: { pages: [] },
      schemaVersion: 2,
      version: 1,
      thumbnailUrl: null,
    });
    const id = created.body.id as string;

    const listed = await admin.get(list).expect(200);
    expect(listed.body.projects).toHaveLength(1);
    expect(listed.body.projects[0]).not.toHaveProperty('document');

    const renamed = await admin
      .patch(`/api/projects/${id}`)
      .send({ version: 1, name: 'Plakat final' })
      .expect(200);
    expect(renamed.body).toMatchObject({
      name: 'Plakat final',
      version: 2,
      document: { pages: [] },
    });

    await admin.delete(`/api/projects/${id}`).expect(204);
    await admin.get(`/api/projects/${id}`).expect(404);
    await admin.delete(`/api/projects/${id}`).expect(404);
  });

  it('applies defaults on an empty create', async () => {
    const res = await admin.post(list).send({}).expect(201);
    expect(res.body).toMatchObject({
      name: 'Untitled',
      document: {},
      schemaVersion: 1,
      version: 1,
    });
  });

  it('rejects a stale version with 409', async () => {
    const { body } = await admin.post(list).send({ name: 'A' }).expect(201);
    await admin
      .patch(`/api/projects/${body.id}`)
      .send({ version: 1, document: { a: 1 } })
      .expect(200);
    const conflict = await admin
      .patch(`/api/projects/${body.id}`)
      .send({ version: 1, document: { a: 2 } })
      .expect(409);
    expect(conflict.body).toMatchObject({ error: 'version_conflict', currentVersion: 2 });
    const current = await admin.get(`/api/projects/${body.id}`).expect(200);
    expect(current.body.document).toEqual({ a: 1 });
  });

  it('validates input', async () => {
    const { body } = await admin.post(list).send({ name: 'A' }).expect(201);
    await admin.post(list).send({ name: '' }).expect(400);
    await admin
      .post(list)
      .send({ document: [1, 2] })
      .expect(400);
    await admin.patch(`/api/projects/${body.id}`).send({ name: 'B' }).expect(400);
    await admin.patch(`/api/projects/${body.id}`).send({ version: 1 }).expect(400);
    await admin.post(list).set('content-type', 'application/json').send('{bad').expect(400);
    await admin.get('/api/projects/not-a-uuid').expect(404);
    await admin
      .patch('/api/projects/00000000-0000-4000-8000-000000000000')
      .send({ version: 1, name: 'x' })
      .expect(404);
  });

  it('stores and serves a PNG thumbnail', async () => {
    const { body } = await admin.post(list).send({ name: 'A' }).expect(201);
    const put = await admin
      .put(`/api/projects/${body.id}/thumbnail`)
      .set('content-type', 'image/png')
      .send(PNG_1X1)
      .expect(200);
    expect(put.body.thumbnailUrl).toMatch(
      new RegExp(`^/api/projects/${body.id}/thumbnail\\?v=\\d+$`)
    );
    expect(put.body.version).toBe(1);

    const img = await admin.get(put.body.thumbnailUrl).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(img.body as Buffer, PNG_1X1)).toBe(0);

    const listed = await admin.get(list).expect(200);
    expect(listed.body.projects[0].thumbnailUrl).toBe(put.body.thumbnailUrl);

    await admin
      .put(`/api/projects/${body.id}/thumbnail`)
      .set('content-type', 'image/png')
      .send(Buffer.from('not a png'))
      .expect(415);
    await admin
      .put(`/api/projects/${body.id}/thumbnail`)
      .set('content-type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff]))
      .expect(415);

    await admin.delete(`/api/projects/${body.id}`).expect(204);
    await admin.get(`/api/projects/${body.id}/thumbnail`).expect(404);
  });

  it('caps the thumbnail size', async () => {
    const small = createApp({ config: { ...config, thumbnailMaxBytes: 100 }, db });
    const login = request.agent(small);
    const session = await login
      .post('/api/auth/login')
      .send({ email: 'admin@example.org', password: PASSWORD })
      .expect(200);
    const { body } = await login
      .post(`/api/orgs/${admin.orgId}/projects`)
      .set('x-csrf-token', session.body.csrfToken)
      .send({})
      .expect(201);
    await login
      .put(`/api/projects/${body.id}/thumbnail`)
      .set('content-type', 'image/png')
      .set('x-csrf-token', session.body.csrfToken)
      .send(Buffer.concat([PNG_1X1, Buffer.alloc(200)]))
      .expect(413);
  });
});
