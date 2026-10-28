// SPDX-License-Identifier: AGPL-3.0-only
// The trash: deleting a project hides it for 30 days. Needs a real Postgres (DATABASE_URL).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import {
  type Client,
  DEFAULT_ORG,
  memberOf,
  otherOrganisation,
  PNG_1X1,
  resetDb,
  setupAdmin,
  testConfig,
} from './helpers.ts';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('trash (Postgres)', () => {
  const config = testConfig({ ai: null });
  const { pool, db } = createDb(config.databaseUrl);
  let app = createApp({ config, db });
  let admin: Client;
  let list: string;
  let trash: string;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await resetDb(pool);
    app = createApp({ config, db });
    admin = await setupAdmin(app);
    list = `/api/orgs/${admin.orgId}/projects`;
    trash = `/api/orgs/${admin.orgId}/trash`;
  });
  afterAll(async () => {
    await pool.end();
  });

  async function create(name = 'Plakat'): Promise<string> {
    const res = await admin
      .post(list)
      .send({ name, document: { pages: [] } })
      .expect(201);
    return res.body.id as string;
  }
  const count = async (id: string) =>
    (await pool.query('SELECT count(*)::int AS n FROM projects WHERE id = $1', [id])).rows[0].n;

  describe('delete', () => {
    it('keeps the row and hides the project from list, read, update and thumbnail', async () => {
      const id = await create();
      await admin
        .put(`/api/projects/${id}/thumbnail`)
        .set('content-type', 'image/png')
        .send(PNG_1X1)
        .expect(200);
      await admin.delete(`/api/projects/${id}`).expect(204);

      expect((await admin.get(list).expect(200)).body.projects).toEqual([]);
      await admin.get(`/api/projects/${id}`).expect(404);
      await admin.patch(`/api/projects/${id}`).send({ version: 1, name: 'x' }).expect(404);
      await admin.get(`/api/projects/${id}/thumbnail`).expect(404);
      await admin
        .put(`/api/projects/${id}/thumbnail`)
        .set('content-type', 'image/png')
        .send(PNG_1X1)
        .expect(404);
      await admin.delete(`/api/projects/${id}`).expect(404);

      const { rows } = await pool.query(
        'SELECT name, version, deleted_at FROM projects WHERE id = $1',
        [id]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ name: 'Plakat', version: 1 });
      expect(rows[0].deleted_at).toBeInstanceOf(Date);
    });

    it('does not count a refused update against the project', async () => {
      const id = await create();
      await admin.delete(`/api/projects/${id}`).expect(204);
      await admin.patch(`/api/projects/${id}`).send({ version: 1, name: 'x' }).expect(404);
      await admin.post(`/api/projects/${id}/restore`).expect(200);
      expect((await admin.get(`/api/projects/${id}`).expect(200)).body).toMatchObject({
        name: 'Plakat',
        version: 1,
      });
    });
  });

  describe('trash list', () => {
    it('lists trashed projects newest first with the days left, and nothing else', async () => {
      const live = await create('Live');
      const older = await create('Older');
      const newer = await create('Newer');
      await admin.delete(`/api/projects/${older}`).expect(204);
      await admin.delete(`/api/projects/${newer}`).expect(204);
      await pool.query(
        "UPDATE projects SET deleted_at = now() - interval '10 days' WHERE id = $1",
        [older]
      );

      const res = await admin.get(trash).expect(200);
      expect(res.body.projects.map((p: { id: string }) => p.id)).toEqual([newer, older]);
      expect(res.body.projects[0]).toMatchObject({
        id: newer,
        name: 'Newer',
        organisationId: admin.orgId,
        daysLeft: 30,
      });
      expect(res.body.projects[1].daysLeft).toBe(20);
      expect(res.body.projects[1]).not.toHaveProperty('document');
      const deletedAt = Date.parse(res.body.projects[0].deletedAt);
      expect(Date.parse(res.body.projects[0].purgeAt) - deletedAt).toBe(30 * 24 * 3600 * 1000);
      expect(res.body.projects.map((p: { id: string }) => p.id)).not.toContain(live);
    });

    it('counts the days left on the database clock, rounded up', async () => {
      const a = await create('A');
      const b = await create('B');
      const c = await create('C');
      for (const id of [a, b, c]) await admin.delete(`/api/projects/${id}`).expect(204);
      await pool.query(
        "UPDATE projects SET deleted_at = now() - interval '29 days 12 hours' WHERE id = $1",
        [a]
      );
      await pool.query(
        "UPDATE projects SET deleted_at = now() - interval '29 days 23 hours' WHERE id = $1",
        [b]
      );
      await pool.query(
        "UPDATE projects SET deleted_at = now() - interval '31 days' WHERE id = $1",
        [c]
      );
      const days = Object.fromEntries(
        (await admin.get(trash)).body.projects.map((p: { name: string; daysLeft: number }) => [
          p.name,
          p.daysLeft,
        ])
      );
      expect(days).toEqual({ A: 1, B: 1, C: 0 });
    });

    it('is empty for a fresh account and refuses a non-member', async () => {
      expect((await admin.get(trash).expect(200)).body).toEqual({ projects: [] });
      const bob = await otherOrganisation(app, pool, 'bob@example.org');
      await bob.get(trash).expect(404);
    });
  });

  describe('restore', () => {
    it('brings the project back unchanged, at its old place in the list', async () => {
      const first = await create('First');
      const second = await create('Second');
      const before = (await admin.get(`/api/projects/${first}`).expect(200)).body;
      await admin.delete(`/api/projects/${first}`).expect(204);
      const res = await admin.post(`/api/projects/${first}/restore`).expect(200);
      expect(res.body).toMatchObject({
        id: first,
        name: 'First',
        version: before.version,
        updatedAt: before.updatedAt,
      });
      expect(res.body).not.toHaveProperty('document');
      expect((await admin.get(`/api/projects/${first}`).expect(200)).body.document).toEqual({
        pages: [],
      });
      expect((await admin.get(list)).body.projects.map((p: { id: string }) => p.id)).toEqual([
        second,
        first,
      ]);
      expect((await admin.get(trash)).body.projects).toEqual([]);
    });

    it('is idempotent: restoring a live project answers 200 with its summary', async () => {
      const id = await create();
      const res = await admin.post(`/api/projects/${id}/restore`).expect(200);
      expect(res.body).toMatchObject({ id, name: 'Plakat', version: 1 });
      await admin.delete(`/api/projects/${id}`).expect(204);
      await admin.post(`/api/projects/${id}/restore`).expect(200);
      await admin.post(`/api/projects/${id}/restore`).expect(200);
    });

    it('is a 404 for a project that does not exist or is not in the caller organisation', async () => {
      await admin.post('/api/projects/00000000-0000-4000-8000-00000000abcd/restore').expect(404);
      const id = await create();
      const bob = await otherOrganisation(app, pool, 'bob2@example.org');
      await bob.post(`/api/projects/${id}/restore`).expect(404);
    });

    it('is a 404 for another account, and the project stays in the trash', async () => {
      const id = await create();
      await admin.delete(`/api/projects/${id}`).expect(204);
      const bob = await otherOrganisation(app, pool, 'bob@example.org');
      await bob.post(`/api/projects/${id}/restore`).expect(404);
      expect((await admin.get(trash)).body.projects).toHaveLength(1);
      await admin.get(`/api/projects/${id}`).expect(404);
    });

    it('is open to an editor of the organisation, like delete', async () => {
      const id = await create();
      const ed = await memberOf(app, pool, DEFAULT_ORG, 'ed@example.org');
      await ed.delete(`/api/projects/${id}`).expect(204);
      await ed.post(`/api/projects/${id}/restore`).expect(200);
    });
  });

  describe('delete now', () => {
    it('removes a trashed project for good, with its thumbnail', async () => {
      const id = await create();
      await admin
        .put(`/api/projects/${id}/thumbnail`)
        .set('content-type', 'image/png')
        .send(PNG_1X1)
        .expect(200);
      await admin.delete(`/api/projects/${id}`).expect(204);
      await admin.delete(`/api/projects/${id}/purge`).expect(204);
      expect(await count(id)).toBe(0);
      expect(
        (await pool.query('SELECT count(*)::int AS n FROM project_thumbnails')).rows[0].n
      ).toBe(0);
      await admin.post(`/api/projects/${id}/restore`).expect(404);
      await admin.delete(`/api/projects/${id}/purge`).expect(404);
      expect((await admin.get(trash)).body.projects).toEqual([]);
    });

    it('refuses a project that is not in the trash', async () => {
      const id = await create();
      await admin.delete(`/api/projects/${id}/purge`).expect(404);
      expect(await count(id)).toBe(1);
      await admin.get(`/api/projects/${id}`).expect(200);
    });

    it('is a 404 for another account, and nothing is removed', async () => {
      const id = await create();
      await admin.delete(`/api/projects/${id}`).expect(204);
      const bob = await otherOrganisation(app, pool, 'bob@example.org');
      await bob.delete(`/api/projects/${id}/purge`).expect(404);
      expect(await count(id)).toBe(1);
    });
  });

  it('adds the column with a live-row index and leaves existing rows live', async () => {
    const { rows } = await pool.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'projects' ORDER BY indexname"
    );
    const names = rows.map((r: { indexname: string }) => r.indexname);
    expect(names).toContain('projects_org_live_updated_idx');
    expect(names).toContain('projects_trashed_idx');
  });
});
