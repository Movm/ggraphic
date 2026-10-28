// SPDX-License-Identifier: AGPL-3.0-only
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

export type Db = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string): { pool: pg.Pool; db: Db } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  return { pool, db: drizzle(pool, { schema }) };
}
