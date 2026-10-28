// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { accounts, sessions } from '../db/schema.ts';
import { randomToken, sha256 } from './tokens.ts';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** No session outlives this, counted from login, however often it slides forward. */
export const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface SessionAccount {
  id: string;
  email: string;
  displayName: string;
  isInstanceAdmin: boolean;
}

export interface LoadedSession {
  tokenHash: string;
  csrfToken: string;
  expiresAt: Date;
  /** True when the expiry moved forward and the cookie must be sent again. */
  renewed: boolean;
  account: SessionAccount;
}

export async function createSession(
  db: Db,
  accountId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    accountId,
    csrfToken: randomToken(),
    expiresAt,
  });
  return { token, expiresAt };
}

/** The live session for a cookie token, renewed when past half its lifetime; else null. */
export async function loadSession(db: Db, token: string): Promise<LoadedSession | null> {
  const tokenHash = sha256(token);
  const [row] = await db
    .select({
      csrfToken: sessions.csrfToken,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
      id: accounts.id,
      email: accounts.email,
      displayName: accounts.displayName,
      isInstanceAdmin: accounts.isInstanceAdmin,
    })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, sql`now()`),
        gt(sessions.createdAt, sql`now() - ${`${SESSION_MAX_AGE_MS} milliseconds`}::interval`)
      )
    );
  if (!row) return null;
  let expiresAt = row.expiresAt;
  let renewed = false;
  const hardEnd = row.createdAt.getTime() + SESSION_MAX_AGE_MS;
  if (expiresAt.getTime() - Date.now() < SESSION_TTL_MS / 2 && expiresAt.getTime() < hardEnd) {
    expiresAt = new Date(Math.min(Date.now() + SESSION_TTL_MS, hardEnd));
    renewed = true;
    await db
      .update(sessions)
      .set({ expiresAt, lastSeenAt: sql`now()` })
      .where(eq(sessions.tokenHash, tokenHash));
  }
  return {
    tokenHash,
    csrfToken: row.csrfToken,
    expiresAt,
    renewed,
    account: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      isInstanceAdmin: row.isInstanceAdmin,
    },
  };
}

export async function deleteSession(db: Db, tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteExpiredSessions(db: Db): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`));
}
