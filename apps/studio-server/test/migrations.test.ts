// SPDX-License-Identifier: AGPL-3.0-only
// Upgrading an instance from before accounts. Needs a real Postgres (DATABASE_URL).
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { runMigrations } from '../src/db/migrate.ts';
import * as schema from '../src/db/schema.ts';
import { adoptLegacyUploads } from '../src/legacyUploads.ts';
import { DEFAULT_ORG, PNG_1X1 } from './helpers.ts';

const url = process.env['DATABASE_URL'];
const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

describe.skipIf(!url)('upgrade from 0001 (Postgres)', () => {
  // A schema of its own, so the other test files' tables stay untouched.
  const name = `upgrade_${process.pid}`;
  const admin = new pg.Pool({ connectionString: url });
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${name}` });
  const db = drizzle(pool, { schema });

  beforeAll(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    await admin.query(`CREATE SCHEMA ${name}`);
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    await admin.end();
  });

  it('moves every existing project to the default organisation', async () => {
    const onlyFirst = mkdtempSync(join(tmpdir(), 'migrations-'));
    copyFileSync(join(MIGRATIONS, '0001_init.sql'), join(onlyFirst, '0001_init.sql'));
    expect(await runMigrations(pool, onlyFirst)).toEqual(['0001_init.sql']);
    await pool.query("INSERT INTO projects (name) VALUES ('one'), ('two')");

    expect(await runMigrations(pool)).toEqual(['0002_accounts.sql', '0003_trash.sql']);
    // The trash column is additive: projects from before it are live.
    expect((await pool.query('SELECT 1 FROM projects WHERE deleted_at IS NOT NULL')).rowCount).toBe(
      0
    );
    const { rows } = await pool.query('SELECT name, organisation_id FROM projects ORDER BY name');
    expect(rows).toEqual([
      { name: 'one', organisation_id: DEFAULT_ORG },
      { name: 'two', organisation_id: DEFAULT_ORG },
    ]);
    await expect(pool.query("INSERT INTO projects (name) VALUES ('orphan')")).rejects.toThrow(
      /organisation_id/
    );
  });

  it('registers existing upload files to the default organisation, once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uploads-'));
    const keep = `${'a'.repeat(32)}.png`;
    writeFileSync(join(dir, keep), PNG_1X1);
    writeFileSync(join(dir, 'notes.txt'), 'not ours');
    mkdirSync(join(dir, `${'b'.repeat(32)}.png`));
    expect(await adoptLegacyUploads(db, dir)).toBe(1);
    expect(await adoptLegacyUploads(db, dir)).toBe(0);
    const { rows } = await pool.query('SELECT file_name, organisation_id, size FROM uploads');
    expect(rows).toEqual([{ file_name: keep, organisation_id: DEFAULT_ORG, size: PNG_1X1.length }]);
    expect(await adoptLegacyUploads(db, join(dir, 'missing'))).toBe(0);
  });
});
