// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Organisation } from './contract.ts';
import type { Db } from './db/client.ts';
import { memberships, organisations, type Role } from './db/schema.ts';

/** A database handle or an open transaction. */
export type Tx = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

export async function createOrganisation(tx: Tx, name: string, ownerId: string): Promise<string> {
  const [org] = await tx.insert(organisations).values({ name }).returning({ id: organisations.id });
  await tx
    .insert(memberships)
    .values({ organisationId: org!.id, accountId: ownerId, role: 'owner' });
  return org!.id;
}

/**
 * The organisation an account works in. Studio is single-user, so every account needs one it
 * OWNS: an account that owns none (no membership at all, or only editor memberships left
 * from invitations) gets a personal organisation named after the person. Serialised per
 * account, so concurrent requests create one, not several. Returns the owned organisation.
 *
 * The common case, an account that owns one, is a single read: no transaction, no lock.
 */
export async function ensurePersonalOrganisation(
  db: Db,
  account: { id: string; displayName: string }
): Promise<string> {
  const owned = (tx: Tx) =>
    tx
      .select({ organisationId: memberships.organisationId })
      .from(memberships)
      .where(and(eq(memberships.accountId, account.id), eq(memberships.role, 'owner')))
      .orderBy(asc(memberships.createdAt), asc(memberships.organisationId))
      .limit(1);
  const [existing] = await owned(db);
  if (existing) return existing.organisationId;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${account.id}))`);
    // Look again under the lock: a concurrent request may have created it meanwhile.
    const [again] = await owned(tx);
    return again?.organisationId ?? createOrganisation(tx, account.displayName, account.id);
  });
}

export async function addMember(
  tx: Tx,
  organisationId: string,
  accountId: string,
  role: Role
): Promise<void> {
  // An existing membership keeps its role: an invitation never demotes.
  await tx.insert(memberships).values({ organisationId, accountId, role }).onConflictDoNothing();
}

// The owned organisation first, then the oldest membership: the first entry is the one
// the account works in.
const membershipOrder = [
  sql`(${memberships.role} = 'owner') DESC`,
  asc(memberships.createdAt),
  asc(memberships.organisationId),
] as const;

export async function organisationsOf(db: Tx, accountId: string): Promise<Organisation[]> {
  return db
    .select({ id: organisations.id, name: organisations.name, role: memberships.role })
    .from(memberships)
    .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
    .where(eq(memberships.accountId, accountId))
    .orderBy(...membershipOrder);
}
