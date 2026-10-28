// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { type Response, Router } from 'express';
import { requireMembership, requireSession } from '../auth/middleware.ts';
import { randomToken, sha256 } from '../auth/tokens.ts';
import type { Config } from '../config.ts';
import {
  createInvitationBody,
  createOrganisationBody,
  type Invitation,
  type Member,
  type Organisation,
  updateMemberBody,
} from '../contract.ts';
import type { Db } from '../db/client.ts';
import { accounts, invitations, memberships, type Role } from '../db/schema.ts';
import { HttpError, parseOr400 } from '../http.ts';
import { createOrganisation } from '../orgs.ts';
import { orgParam } from './projects.ts';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const notFound = () => new HttpError(404, { error: 'not_found' });
const lastOwner = () =>
  new HttpError(409, {
    error: 'last_owner',
    message: 'An organisation needs at least one owner.',
  });

function uuidParam(raw: string | undefined): string {
  return orgParam({ orgId: raw });
}

export function organisationsRouter(db: Db, config: Config): Router {
  const router = Router();
  const me = (res: Response) => requireSession(res).account;

  router.post('/', async (req, res) => {
    const account = me(res);
    if (!account.isInstanceAdmin && !config.allowRegistration) {
      throw new HttpError(403, {
        error: 'forbidden',
        message: 'Only the instance admin can create organisations.',
      });
    }
    const { name } = parseOr400(createOrganisationBody, req.body);
    const id = await db.transaction((tx) => createOrganisation(tx, name, account.id));
    const body: Organisation = { id, name, role: 'owner' };
    res.status(201).json(body);
  });

  router.get('/:orgId/members', async (req, res) => {
    const orgId = orgParam(req.params);
    await requireMembership(db, me(res).id, orgId);
    const rows: Member[] = await db
      .select({
        accountId: accounts.id,
        email: accounts.email,
        displayName: accounts.displayName,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(eq(memberships.organisationId, orgId))
      .orderBy(asc(accounts.displayName), asc(accounts.email));
    res.json({ members: rows });
  });

  /** Changes members under a row lock, so two owners cannot demote each other at once. */
  async function changeMember(
    orgId: string,
    accountId: string,
    change: { role: Role } | 'remove'
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const rows = await tx.execute<{ account_id: string; role: Role }>(
        sql`SELECT account_id, role FROM memberships WHERE organisation_id = ${orgId} FOR UPDATE`
      );
      const target = rows.rows.find((r) => r.account_id === accountId);
      if (!target) throw notFound();
      const owners = rows.rows.filter((r) => r.role === 'owner').length;
      const losesOwner =
        target.role === 'owner' && (change === 'remove' || change.role !== 'owner');
      if (losesOwner && owners <= 1) throw lastOwner();
      const where = and(
        eq(memberships.organisationId, orgId),
        eq(memberships.accountId, accountId)
      );
      if (change === 'remove') await tx.delete(memberships).where(where);
      else await tx.update(memberships).set({ role: change.role }).where(where);
    });
  }

  router.patch('/:orgId/members/:accountId', async (req, res) => {
    const orgId = orgParam(req.params);
    await requireMembership(db, me(res).id, orgId, 'owner');
    const { role } = parseOr400(updateMemberBody, req.body);
    await changeMember(orgId, uuidParam(req.params.accountId), { role });
    res.status(204).end();
  });

  router.delete('/:orgId/members/:accountId', async (req, res) => {
    const orgId = orgParam(req.params);
    const target = uuidParam(req.params.accountId);
    // Everyone may leave; removing someone else needs owner.
    await requireMembership(db, me(res).id, orgId, target === me(res).id ? 'editor' : 'owner');
    await changeMember(orgId, target, 'remove');
    res.status(204).end();
  });

  const toInvitation = (row: {
    id: string;
    role: Role;
    createdAt: Date;
    expiresAt: Date;
    allowsSignup: boolean;
  }): Invitation => ({
    id: row.id,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    allowsSignup: row.allowsSignup || config.allowRegistration,
  });

  const invitationColumns = {
    id: invitations.id,
    role: invitations.role,
    createdAt: invitations.createdAt,
    expiresAt: invitations.expiresAt,
    allowsSignup: invitations.allowsSignup,
  };

  router.get('/:orgId/invitations', async (req, res) => {
    const orgId = orgParam(req.params);
    await requireMembership(db, me(res).id, orgId, 'owner');
    const rows = await db
      .select(invitationColumns)
      .from(invitations)
      .where(
        and(
          eq(invitations.organisationId, orgId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, sql`now()`)
        )
      )
      .orderBy(asc(invitations.createdAt));
    res.set('Cache-Control', 'no-store').json({ invitations: rows.map(toInvitation) });
  });

  router.post('/:orgId/invitations', async (req, res) => {
    const account = me(res);
    const orgId = orgParam(req.params);
    await requireMembership(db, account.id, orgId, 'owner');
    const { role } = parseOr400(createInvitationBody, req.body ?? {});
    const token = randomToken();
    const [row] = await db
      .insert(invitations)
      .values({
        tokenHash: sha256(token),
        organisationId: orgId,
        role,
        createdBy: account.id,
        allowsSignup: account.isInstanceAdmin,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      })
      .returning(invitationColumns);
    // The token exists only in this answer; the database keeps its hash.
    res
      .status(201)
      .set('Cache-Control', 'no-store')
      .json({ ...toInvitation(row!), url: `/invite/${token}` });
  });

  router.delete('/:orgId/invitations/:id', async (req, res) => {
    const orgId = orgParam(req.params);
    await requireMembership(db, me(res).id, orgId, 'owner');
    const deleted = await db
      .delete(invitations)
      .where(
        and(
          eq(invitations.id, uuidParam(req.params.id)),
          eq(invitations.organisationId, orgId),
          isNull(invitations.acceptedAt)
        )
      )
      .returning({ id: invitations.id });
    if (deleted.length === 0) throw notFound();
    res.status(204).end();
  });

  return router;
}
