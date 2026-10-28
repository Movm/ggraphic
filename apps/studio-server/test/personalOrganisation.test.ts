// SPDX-License-Identifier: AGPL-3.0-only
// Every account has an organisation to work in. Needs a real Postgres (DATABASE_URL).
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { hashPassword } from '../src/auth/passwords.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { accounts, memberships, organisations } from '../src/db/schema.ts';
import { ensurePersonalOrganisation } from '../src/orgs.ts';
import { DEFAULT_ORG, PASSWORD, resetDb, setupAdmin, testConfig } from './helpers.ts';

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

  it('leaves an account that already has a membership alone', async () => {
    const admin = await setupAdmin(app);
    const id = await ensurePersonalOrganisation(db, { id: admin.accountId, displayName: 'Admin' });
    expect(id).toBe(DEFAULT_ORG);
    expect(await membershipsOf(admin.accountId)).toHaveLength(1);
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

    it('lists the oldest membership first when the account owns none', async () => {
      const admin = await setupAdmin(app);
      const [older, newer] = await db
        .insert(organisations)
        .values([{ name: 'Zzz older' }, { name: 'Aaa newer' }])
        .returning();
      await db.delete(memberships).where(eq(memberships.accountId, admin.accountId));
      await db.insert(memberships).values([
        {
          organisationId: newer!.id,
          accountId: admin.accountId,
          role: 'editor',
          createdAt: new Date('2024-01-01'),
        },
        {
          organisationId: older!.id,
          accountId: admin.accountId,
          role: 'editor',
          createdAt: new Date('2022-01-01'),
        },
      ]);
      const res = await admin.get('/api/auth/session').expect(200);
      expect(res.body.organisations.map((o: { id: string }) => o.id)).toEqual([
        older!.id,
        newer!.id,
      ]);
    });
  });
});
