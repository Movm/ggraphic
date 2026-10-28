// SPDX-License-Identifier: AGPL-3.0-only
import { asc, eq, sql } from 'drizzle-orm';
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
 * The organisation an account without one works in: a personal organisation named after
 * the person, owned by them. An account that already has a membership is left alone.
 * Serialised per account, so concurrent logins create one organisation, not several.
 */
export async function ensurePersonalOrganisation(
  db: Db,
  account: { id: string; displayName: string }
): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${account.id}))`);
    const [existing] = await tx
      .select({ organisationId: memberships.organisationId })
      .from(memberships)
      .where(eq(memberships.accountId, account.id))
      .orderBy(...membershipOrder)
      .limit(1);
    return existing?.organisationId ?? createOrganisation(tx, account.displayName, account.id);
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
