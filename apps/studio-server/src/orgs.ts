// SPDX-License-Identifier: AGPL-3.0-only
import { asc, eq } from 'drizzle-orm';
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

export async function addMember(
  tx: Tx,
  organisationId: string,
  accountId: string,
  role: Role
): Promise<void> {
  // An existing membership keeps its role: an invitation never demotes.
  await tx.insert(memberships).values({ organisationId, accountId, role }).onConflictDoNothing();
}

export async function organisationsOf(db: Tx, accountId: string): Promise<Organisation[]> {
  return db
    .select({ id: organisations.id, name: organisations.name, role: memberships.role })
    .from(memberships)
    .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
    .where(eq(memberships.accountId, accountId))
    .orderBy(asc(organisations.name), asc(organisations.id));
}
