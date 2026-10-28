// SPDX-License-Identifier: AGPL-3.0-only
import { and, inArray, lt } from 'drizzle-orm';
import type pg from 'pg';
import type { Config } from './config.ts';
import type { Db } from './db/client.ts';
import { projects } from './db/schema.ts';
import { TRASH_RETENTION_MS } from './trash.ts';

/** Arbitrary constant: only one instance purges at a time. */
export const TRASH_PURGE_LOCK_KEY = 7_401_554;
const BATCH = 200;
const FIRST_RUN_MS = 10 * 60 * 1000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Removes the projects that have been in the trash for more than the retention period,
 * with their thumbnails (cascade), and returns how many.
 *
 * The cutoff is part of the DELETE's own WHERE clause, not only of the SELECT that picks
 * the rows. A project restored between the two has `deleted_at = NULL` by the time the
 * DELETE reaches it, and Postgres re-checks the clause on the new version of the row:
 * it is skipped, never purged.
 */
export async function purgeExpiredTrash(db: Db, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_MS);
  let total = 0;
  for (;;) {
    const batch = await db
      .delete(projects)
      .where(
        and(
          lt(projects.deletedAt, cutoff),
          inArray(
            projects.id,
            db
              .select({ id: projects.id })
              .from(projects)
              .where(lt(projects.deletedAt, cutoff))
              .orderBy(projects.deletedAt)
              .limit(BATCH)
          )
        )
      )
      .returning({ id: projects.id });
    total += batch.length;
    if (batch.length < BATCH) return total;
  }
}

/**
 * One purge, unless another instance is purging: null then. The advisory lock is held by a
 * connection of its own for the duration, and is released with it if the process dies.
 */
export async function runTrashPurge(
  pool: pg.Pool,
  db: Db,
  now = new Date()
): Promise<number | null> {
  const lock = await pool.connect();
  // A connection whose unlock failed may still hold the session lock: destroy it, which
  // ends the session and with it the lock, instead of handing it back to the pool.
  let broken: Error | undefined;
  try {
    const { rows } = await lock.query<{ got: boolean }>('SELECT pg_try_advisory_lock($1) AS got', [
      TRASH_PURGE_LOCK_KEY,
    ]);
    if (!rows[0]?.got) return null;
    try {
      return await purgeExpiredTrash(db, now);
    } finally {
      try {
        await lock.query('SELECT pg_advisory_unlock($1)', [TRASH_PURGE_LOCK_KEY]);
      } catch (err) {
        broken = err instanceof Error ? err : new Error('unlock failed');
        throw broken;
      }
    }
  } finally {
    lock.release(broken);
  }
}

export interface TrashPurgeOptions {
  pool: pg.Pool;
  db: Db;
  config: Pick<Config, 'trashPurgeEnabled'>;
  firstRunMs?: number;
  intervalMs?: number;
  log?: (message: string) => void;
}

/**
 * Purges in the background: first run ten minutes after start, then every six hours.
 * Every tick logs its count (and nothing about the projects). Null when switched off with
 * TRASH_PURGE_ENABLED=false.
 */
export function startTrashPurge({
  pool,
  db,
  config,
  firstRunMs = FIRST_RUN_MS,
  intervalMs = INTERVAL_MS,
  log = console.log,
}: TrashPurgeOptions): { stop(): void } | null {
  if (!config.trashPurgeEnabled) {
    log('Trash purge: off (TRASH_PURGE_ENABLED=false)');
    return null;
  }
  const tick = async () => {
    try {
      const removed = await runTrashPurge(pool, db);
      log(
        removed === null
          ? 'Trash purge: skipped, another instance is purging'
          : `Trash purge: removed ${removed} projects`
      );
    } catch (err) {
      log(`Trash purge: failed (${err instanceof Error ? err.message : 'unknown error'})`);
    }
  };
  let interval: NodeJS.Timeout | undefined;
  const first = setTimeout(() => {
    void tick();
    interval = setInterval(() => void tick(), intervalMs);
    interval.unref();
  }, firstRunMs);
  first.unref();
  return {
    stop() {
      clearTimeout(first);
      clearInterval(interval);
    },
  };
}
