// SPDX-License-Identifier: AGPL-3.0-only
// The purge removes projects that sat in the trash for 30 days. Needs a real Postgres.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { TRASH_RETENTION_DAYS } from '../src/trash.ts';
import {
  purgeExpiredTrash,
  runTrashPurge,
  startTrashPurge,
  TRASH_PURGE_LOCK_KEY,
} from '../src/trashPurge.ts';
import { DEFAULT_ORG, PNG_1X1, resetDb, setupAdmin, testConfig } from './helpers.ts';

const hasDb = Boolean(process.env['DATABASE_URL']);
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!hasDb)('trash purge (Postgres)', () => {
  const config = testConfig({ ai: null });
  const { pool, db } = createDb(config.databaseUrl);
  const now = new Date('2026-11-15T12:00:00Z');

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await resetDb(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  /** A project in the default organisation, deleted `daysAgo` days before `now`; null = live. */
  async function project(name: string, daysAgo: number | null): Promise<string> {
    const deletedAt = daysAgo === null ? null : new Date(now.getTime() - daysAgo * DAY);
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO projects (name, organisation_id, deleted_at) VALUES ($1, $2, $3) RETURNING id',
      [name, DEFAULT_ORG, deletedAt]
    );
    return rows[0]!.id;
  }
  const names = async () =>
    (await pool.query('SELECT name FROM projects ORDER BY name')).rows.map(
      (r: { name: string }) => r.name
    );

  it('keeps 30 days as the retention', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });

  it('removes projects trashed more than 30 days ago and nothing else', async () => {
    await project('live', null);
    await project('recent', 29);
    await project('exactly-30-days', 30);
    await project('old', 31);
    await project('older', 400);
    expect(await purgeExpiredTrash(db, now)).toBe(2);
    expect(await names()).toEqual(['exactly-30-days', 'live', 'recent']);
    expect(await purgeExpiredTrash(db, now)).toBe(0);
  });

  it('takes the thumbnail with the project', async () => {
    const id = await project('old', 40);
    await pool.query('INSERT INTO project_thumbnails (project_id, png) VALUES ($1, $2)', [
      id,
      PNG_1X1,
    ]);
    await purgeExpiredTrash(db, now);
    expect((await pool.query('SELECT count(*)::int AS n FROM project_thumbnails')).rows[0].n).toBe(
      0
    );
  });

  it('works through more than one batch', async () => {
    await pool.query(
      `INSERT INTO projects (name, organisation_id, deleted_at)
       SELECT 'p' || n, $1, $2::timestamptz - interval '40 days' FROM generate_series(1, 450) n`,
      [DEFAULT_ORG, now]
    );
    expect(await purgeExpiredTrash(db, now)).toBe(450);
    expect(await names()).toEqual([]);
  });

  it('never purges a project that was restored first', async () => {
    const id = await project('restored', 40);
    await pool.query('UPDATE projects SET deleted_at = NULL WHERE id = $1', [id]);
    expect(await purgeExpiredTrash(db, now)).toBe(0);
    expect(await names()).toEqual(['restored']);
  });

  it('never purges a project that is restored while the purge is running', async () => {
    const id = await project('racing', 40);
    // The restore has written but not committed: the purge picks the row (still old and
    // trashed for everyone else), then waits for it and must look at the new version.
    const restorer = await pool.connect();
    try {
      await restorer.query('BEGIN');
      await restorer.query('UPDATE projects SET deleted_at = NULL WHERE id = $1', [id]);
      const purge = purgeExpiredTrash(db, now);
      await new Promise((r) => setTimeout(r, 200));
      await restorer.query('COMMIT');
      expect(await purge).toBe(0);
    } finally {
      restorer.release();
    }
    expect(await names()).toEqual(['racing']);
  });

  it('is not undone by a restore through the API racing the purge', async () => {
    const app = createApp({ config, db });
    const admin = await setupAdmin(app);
    for (let i = 0; i < 10; i++) {
      const created = await admin.post(`/api/orgs/${admin.orgId}/projects`).send({ name: `r${i}` });
      const id = created.body.id as string;
      await admin.delete(`/api/projects/${id}`).expect(204);
      await pool.query(
        "UPDATE projects SET deleted_at = now() - interval '31 days' WHERE id = $1",
        [id]
      );
      const [restore] = await Promise.all([
        admin.post(`/api/projects/${id}/restore`),
        purgeExpiredTrash(db, new Date()),
      ]);
      const exists = (await pool.query('SELECT 1 FROM projects WHERE id = $1', [id])).rowCount;
      // Either the restore won (200, the project is there) or the purge did (404, it is gone).
      expect(restore.status === 200 ? exists : 1 - (exists ?? 0)).toBe(1);
    }
  });

  describe('one run at a time', () => {
    it('runs and reports the count when it gets the lock', async () => {
      await project('old', 40);
      expect(await runTrashPurge(pool, db, now)).toBe(1);
    });

    it('does nothing while another instance holds the lock', async () => {
      await project('old', 40);
      const other = await pool.connect();
      try {
        await other.query('SELECT pg_advisory_lock($1)', [TRASH_PURGE_LOCK_KEY]);
        expect(await runTrashPurge(pool, db, now)).toBeNull();
        expect(await names()).toEqual(['old']);
        await other.query('SELECT pg_advisory_unlock($1)', [TRASH_PURGE_LOCK_KEY]);
      } finally {
        other.release();
      }
      expect(await runTrashPurge(pool, db, now)).toBe(1);
    });

    it('releases the lock after a run', async () => {
      await runTrashPurge(pool, db, now);
      const other = await pool.connect();
      try {
        const { rows } = await other.query('SELECT pg_try_advisory_lock($1) AS got', [
          TRASH_PURGE_LOCK_KEY,
        ]);
        expect(rows[0].got).toBe(true);
        await other.query('SELECT pg_advisory_unlock($1)', [TRASH_PURGE_LOCK_KEY]);
      } finally {
        other.release();
      }
    });
  });

  describe('the timer', () => {
    it('does not start when TRASH_PURGE_ENABLED is false', async () => {
      await project('old', 40);
      const log = vi.fn();
      const timer = startTrashPurge({
        pool,
        db,
        config: { ...config, trashPurgeEnabled: false },
        firstRunMs: 1,
        intervalMs: 1000,
        log,
      });
      expect(timer).toBeNull();
      await new Promise((r) => setTimeout(r, 100));
      expect(await names()).toEqual(['old']);
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/off/i));
    });

    it('logs every tick with the count only, and purges', async () => {
      await pool.query(
        "INSERT INTO projects (name, organisation_id, deleted_at) VALUES ('secret-name', $1, now() - interval '40 days')",
        [DEFAULT_ORG]
      );
      const log = vi.fn();
      const timer = startTrashPurge({
        pool,
        db,
        config: { ...config, trashPurgeEnabled: true },
        firstRunMs: 10,
        intervalMs: 50,
        log,
      });
      try {
        await vi.waitFor(() => expect(log.mock.calls.length).toBeGreaterThanOrEqual(2));
      } finally {
        timer?.stop();
      }
      expect(log.mock.calls[0]![0]).toMatch(/removed 1 /);
      expect(log.mock.calls[1]![0]).toMatch(/removed 0 /);
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret-name');
      expect(await names()).toEqual([]);
    });

    it('logs a failed run and keeps going', async () => {
      const log = vi.fn();
      const broken = {
        connect: () => Promise.reject(new Error('db down')),
      } as unknown as typeof pool;
      const timer = startTrashPurge({
        pool: broken,
        db,
        config: { ...config, trashPurgeEnabled: true },
        firstRunMs: 10,
        intervalMs: 30,
        log,
      });
      try {
        await vi.waitFor(() => expect(log.mock.calls.length).toBeGreaterThanOrEqual(2));
      } finally {
        timer?.stop();
      }
      expect(log.mock.calls[0]![0]).toMatch(/failed.*db down/);
    });
  });
});
