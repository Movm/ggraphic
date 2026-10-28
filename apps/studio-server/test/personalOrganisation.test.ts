// SPDX-License-Identifier: AGPL-3.0-only
// Every account has an organisation to work in. Needs a real Postgres (DATABASE_URL).
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { hashPassword } from '../src/auth/passwords.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { accounts, memberships, organisations } from '../src/db/schema.ts';
import { ensurePersonalOrganisation } from '../src/orgs.ts';
import {
  BRAND_SETTINGS,
  DEFAULT_ORG,
  memberOf,
  PASSWORD,
  resetDb,
  setupAdmin,
  testConfig,
} from './helpers.ts';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('personal organisation (Postgres)', () => {
  const config = testConfig();
  const { pool, db } = createDb(config.databaseUrl);
  let app = createApp({ config, db });

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await resetDb(pool);
    app = createApp({ config, db });
  });
  afterAll(async () => {
    await pool.end();
  });

  /** An account that exists but belongs to no organisation. */
  async function orphan(email = 'orphan@example.org', displayName = 'Olga Orphan') {
    const [account] = await db
      .insert(accounts)
      .values({ email, displayName, passwordHash: await hashPassword(PASSWORD) })
      .returning({ id: accounts.id, displayName: accounts.displayName });
    return account!;
  }
  const membershipsOf = (accountId: string) =>
    db.select().from(memberships).where(eq(memberships.accountId, accountId));

  it('creates an organisation named after the person, owned by them', async () => {
    const account = await orphan();
    const orgId = await ensurePersonalOrganisation(db, account);
    const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId));
    expect(org?.name).toBe('Olga Orphan');
    expect(await membershipsOf(account.id)).toMatchObject([
      { organisationId: orgId, role: 'owner' },
    ]);
  });

  it('is idempotent: a second call returns the same organisation', async () => {
    const account = await orphan();
    const first = await ensurePersonalOrganisation(db, account);
    expect(await ensurePersonalOrganisation(db, account)).toBe(first);
    expect(await membershipsOf(account.id)).toHaveLength(1);
  });

  it('creates exactly one organisation under concurrent calls', async () => {
    const account = await orphan();
    const ids = await Promise.all(
      Array.from({ length: 8 }, () => ensurePersonalOrganisation(db, account))
    );
    expect(new Set(ids).size).toBe(1);
    expect(await membershipsOf(account.id)).toHaveLength(1);
  });

  it('leaves an account that already owns an organisation alone', async () => {
    const admin = await setupAdmin(app);
    const id = await ensurePersonalOrganisation(db, { id: admin.accountId, displayName: 'Admin' });
    expect(id).toBe(DEFAULT_ORG);
    expect(await membershipsOf(admin.accountId)).toHaveLength(1);
  });

  it('takes no transaction and no lock when the account already owns an organisation', async () => {
    const admin = await setupAdmin(app);
    const transaction = vi.spyOn(db, 'transaction');
    const execute = vi.spyOn(db, 'execute');
    try {
      await ensurePersonalOrganisation(db, { id: admin.accountId, displayName: 'Admin' });
      await admin.get('/api/auth/session').expect(200);
      expect(transaction).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    } finally {
      transaction.mockRestore();
      execute.mockRestore();
    }
  });

  it('gives an editor-only account an organisation of its own, which it owns', async () => {
    await setupAdmin(app);
    const ed = await memberOf(app, pool, DEFAULT_ORG, 'ed@example.org');
    const session = await ed.get('/api/auth/session').expect(200);
    expect(session.body.organisations).toHaveLength(2);
    expect(session.body.organisations[0]).toMatchObject({ name: 'ed', role: 'owner' });
    expect(session.body.organisations[1]).toMatchObject({ id: DEFAULT_ORG, role: 'editor' });
    expect(ed.orgId).toBe(session.body.organisations[0].id);
    // It can save its brand there.
    await ed.put(`/api/orgs/${ed.orgId}/brand-pack`).send(BRAND_SETTINGS).expect(200);
    // One personal organisation, however often it logs in.
    await ed.get('/api/auth/session').expect(200);
    const again = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ed@example.org', password: PASSWORD })
      .expect(200);
    expect(again.body.organisations).toHaveLength(2);
  });

  it('gives an account without a membership an organisation at login', async () => {
    await orphan('orphan@example.org');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'orphan@example.org', password: PASSWORD })
      .expect(200);
    expect(res.body.organisations).toMatchObject([{ name: 'Olga Orphan', role: 'owner' }]);
  });

  it('repairs an open session that lost its last membership', async () => {
    const admin = await setupAdmin(app);
    await db.delete(memberships).where(eq(memberships.accountId, admin.accountId));
    const res = await admin.get('/api/auth/session').expect(200);
    expect(res.body.organisations).toMatchObject([{ name: 'Admin', role: 'owner' }]);
    const again = await admin.get('/api/auth/session').expect(200);
    expect(again.body.organisations).toHaveLength(1);
  });

  describe('which organisation comes first', () => {
    it('lists the organisation the account owns before older memberships', async () => {
      const admin = await setupAdmin(app);
      const [other] = await db.insert(organisations).values({ name: 'Aaa other' }).returning();
      // The editor membership is older than the owned one and sorts first by name.
      await db.insert(memberships).values({
        organisationId: other!.id,
        accountId: admin.accountId,
        role: 'editor',
        createdAt: new Date('2020-01-01'),
      });
      const res = await admin.get('/api/auth/session').expect(200);
      expect(res.body.organisations.map((o: { id: string }) => o.id)).toEqual([
        DEFAULT_ORG,
        other!.id,
      ]);
    });

    it('lists an owned organisation first even if an editor membership is older', async () => {
      const admin = await setupAdmin(app);
      const ed = await memberOf(app, pool, DEFAULT_ORG, 'ed@example.org');
      await pool.query(
        "UPDATE memberships SET created_at = '2000-01-01' WHERE account_id = $1 AND role = 'editor'",
        [ed.accountId]
      );
      const res = await ed.get('/api/auth/session').expect(200);
      expect(res.body.organisations[0].role).toBe('owner');
      expect(admin.accountId).not.toBe(ed.accountId);
    });
  });
});
