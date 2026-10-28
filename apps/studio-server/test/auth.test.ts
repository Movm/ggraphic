// SPDX-License-Identifier: AGPL-3.0-only
// Accounts, sessions, CSRF, rate limits, invitations and members. Needs a real Postgres.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { FixedWindowLimiter } from '../src/auth/rateLimit.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import {
  DEFAULT_ORG,
  invite,
  otherOrganisation,
  PASSWORD,
  resetDb,
  setupAdmin,
  testConfig,
  TEST_SETUP_TOKEN,
} from './helpers.ts';

const hasDb = Boolean(process.env['DATABASE_URL']);
const signup = (email: string) => ({ email, displayName: 'Someone', password: PASSWORD });
const setupBody = (email: string, setupToken = TEST_SETUP_TOKEN) => ({ ...signup(email), setupToken });

describe.skipIf(!hasDb)('accounts and sessions (Postgres)', () => {
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

  describe('first run', () => {
    it('asks for setup on an empty instance', async () => {
      const res = await request(app).get('/api/auth/session').expect(200);
      expect(res.body).toMatchObject({
        setupRequired: true,
        registrationOpen: false,
        account: null,
        csrfToken: null,
        organisations: [],
      });
    });

    it('makes the first account instance admin and owner of the default organisation', async () => {
      const admin = await setupAdmin(app);
      const res = await admin.get('/api/auth/session').expect(200);
      expect(res.body.account).toMatchObject({ email: 'admin@example.org', isInstanceAdmin: true });
      expect(res.body.organisations).toEqual([
        { id: DEFAULT_ORG, name: 'My organisation', role: 'owner' },
      ]);
      expect(res.body.canCreateOrganisations).toBe(true);
      expect((await request(app).get('/api/auth/session')).body.setupRequired).toBe(false);
    });

    it('hands projects from before accounts to the first admin', async () => {
      // A project as migration 0002 leaves it: in the default organisation, no owner.
      const { rows } = await pool.query<{ id: string }>(
        "INSERT INTO projects (name, organisation_id) VALUES ('Legacy', $1) RETURNING id",
        [DEFAULT_ORG]
      );
      const admin = await setupAdmin(app);
      const list = await admin.get(`/api/orgs/${DEFAULT_ORG}/projects`).expect(200);
      expect(list.body.projects.map((p: { id: string }) => p.id)).toEqual([rows[0]!.id]);
    });

    it('allows setup once, also when two arrive at the same time', async () => {
      const results = await Promise.all([
        request(app).post('/api/auth/setup').send(setupBody('a@example.org')),
        request(app).post('/api/auth/setup').send(setupBody('b@example.org')),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM accounts');
      expect(rows[0].n).toBe(1);
      await request(app).post('/api/auth/setup').send(setupBody('c@example.org')).expect(409);
    });

    it('requires the setup token printed at start', async () => {
      const missing = await request(app)
        .post('/api/auth/setup')
        .send(signup('a@example.org'))
        .expect(403);
      expect(missing.body.error).toBe('setup_token_invalid');
      await request(app)
        .post('/api/auth/setup')
        .send(setupBody('a@example.org', 'wrong-token'))
        .expect(403);
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM accounts');
      expect(rows[0].n).toBe(0);
      // An instance started without a token (accounts existed then) cannot be claimed.
      const tokenless = createApp({ config: { ...config, setupToken: null }, db });
      await request(tokenless)
        .post('/api/auth/setup')
        .send(setupBody('a@example.org'))
        .expect(403);
      await request(app).post('/api/auth/setup').send(setupBody('a@example.org')).expect(201);
    });

    it('invalidates the setup token with the first account', async () => {
      await setupAdmin(app);
      await pool.query('TRUNCATE accounts CASCADE');
      // Even if the table empties again, the used token does not claim it a second time.
      await request(app).post('/api/auth/setup').send(setupBody('b@example.org')).expect(403);
    });

    it('checks for an existing account before hashing', async () => {
      await setupAdmin(app);
      const res = await request(app)
        .post('/api/auth/setup')
        .send(setupBody('b@example.org', 'wrong'))
        .expect(409);
      expect(res.body.error).toBe('already_set_up');
    });

    it('validates the setup body', async () => {
      await request(app)
        .post('/api/auth/setup')
        .send({ ...setupBody('a@example.org'), password: 'short' })
        .expect(400);
      await request(app).post('/api/auth/setup').send(setupBody('not-an-email')).expect(400);
    });
  });

  describe('sessions', () => {
    it('sets an httpOnly, SameSite=Lax cookie and stores only hashes', async () => {
      const res = await request(app).post('/api/auth/setup').send(setupBody('a@example.org'));
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(
        /^studio_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax$/
      );
      const token = /studio_session=([^;]+)/.exec(cookie)![1]!;
      const { rows } = await pool.query('SELECT token_hash FROM sessions');
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).not.toBe(token);
      const account = await pool.query('SELECT password_hash FROM accounts');
      expect(account.rows[0].password_hash).toMatch(/^\$argon2id\$/);
      expect(account.rows[0].password_hash).not.toContain(PASSWORD);
    });

    it('uses a __Host- Secure cookie by default', async () => {
      const secure = createApp({ config: { ...config, cookieSecure: true }, db });
      const res = await request(secure).post('/api/auth/setup').send(setupBody('a@example.org'));
      expect(String(res.headers['set-cookie'])).toMatch(
        /^__Host-studio_session=[^;]+; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax; Secure$/
      );
    });

    it('logs in case-insensitively and logs out', async () => {
      await setupAdmin(app);
      const agent = request.agent(app);
      const login = await agent
        .post('/api/auth/login')
        .send({ email: ' ADMIN@Example.org ', password: PASSWORD })
        .expect(200);
      expect(login.body.account.email).toBe('admin@example.org');
      await agent.get(`/api/orgs/${DEFAULT_ORG}/projects`).expect(200);
      await agent.post('/api/auth/logout').expect(403); // no CSRF token
      const out = await agent
        .post('/api/auth/logout')
        .set('x-csrf-token', login.body.csrfToken)
        .expect(204);
      expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
      await agent.get(`/api/orgs/${DEFAULT_ORG}/projects`).expect(401);
    });

    it('answers wrong password and unknown email alike', async () => {
      await setupAdmin(app);
      const wrong = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.org', password: 'wrong password' })
        .expect(401);
      const unknown = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.org', password: 'wrong password' })
        .expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.headers['set-cookie']).toBeUndefined();
    });

    it('rejects an expired session', async () => {
      const admin = await setupAdmin(app);
      await pool.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
      await admin.get(`/api/orgs/${DEFAULT_ORG}/projects`).expect(401);
    });

    it('slides a session past half its lifetime forward', async () => {
      const admin = await setupAdmin(app);
      await pool.query("UPDATE sessions SET expires_at = now() + interval '1 day'");
      const res = await admin.get('/api/auth/session').expect(200);
      expect(String(res.headers['set-cookie'])).toMatch(/Max-Age=25\d{5}/);
      const { rows } = await pool.query(
        "SELECT expires_at > now() + interval '29 days' AS renewed FROM sessions"
      );
      expect(rows[0].renewed).toBe(true);
    });

    it('logs no password or token', async () => {
      const spies = (['log', 'warn', 'error', 'info'] as const).map((m) =>
        vi.spyOn(console, m).mockImplementation(() => {})
      );
      try {
        const admin = await setupAdmin(app);
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'admin@example.org', password: 'a wrong password' });
        await admin.post('/api/auth/logout');
        const printed = JSON.stringify(spies.map((s) => s.mock.calls));
        expect(printed).not.toContain(PASSWORD);
        expect(printed).not.toContain('a wrong password');
        expect(printed).not.toContain(admin.csrf);
      } finally {
        spies.forEach((s) => s.mockRestore());
      }
    });
  });

  describe('CSRF', () => {
    it('requires the session token on every state-changing request', async () => {
      const admin = await setupAdmin(app);
      const path = `/api/orgs/${DEFAULT_ORG}/projects`;
      await admin.agent.post(path).send({}).expect(403);
      await admin.agent.post(path).set('x-csrf-token', 'wrong').send({}).expect(403);
      await admin.agent.post(path).set('x-csrf-token', admin.csrf).send({}).expect(201);
      await admin.agent.get(path).expect(200);
    });

    it('binds the token to the session', async () => {
      const admin = await setupAdmin(app);
      const other = request.agent(app);
      const login = await other
        .post('/api/auth/login')
        .send({ email: 'admin@example.org', password: PASSWORD })
        .expect(200);
      expect(login.body.csrfToken).not.toBe(admin.csrf);
      await other
        .post(`/api/orgs/${DEFAULT_ORG}/projects`)
        .set('x-csrf-token', admin.csrf)
        .send({})
        .expect(403);
    });
  });

  describe('rate limits', () => {
    it('locks an email after 10 failed logins, also for the right password', async () => {
      await setupAdmin(app);
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'admin@example.org', password: 'wrong password' })
          .expect(401);
      }
      const locked = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.org', password: PASSWORD })
        .expect(429);
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('limits attempts per client IP across endpoints', async () => {
      const limited = createApp({
        config,
        db,
        limiters: {
          email: new FixedWindowLimiter({ limit: 100, windowMs: 60_000 }),
          ip: new FixedWindowLimiter({ limit: 2, windowMs: 60_000 }),
        },
      });
      await request(limited).post('/api/auth/login').send({}).expect(400);
      await request(limited).post('/api/auth/register').send({}).expect(403);
      await request(limited).post('/api/auth/setup').send(signup('a@example.org')).expect(429);
    });
  });

  describe('registration', () => {
    it('is closed by default', async () => {
      await setupAdmin(app);
      const res = await request(app)
        .post('/api/auth/register')
        .send(signup('b@example.org'))
        .expect(403);
      expect(res.body.error).toBe('registration_closed');
    });

    it('when open, gives a new account its own organisation', async () => {
      const open = createApp({ config: { ...config, allowRegistration: true }, db });
      await setupAdmin(open);
      const res = await request(open)
        .post('/api/auth/register')
        .send(signup('b@example.org'))
        .expect(201);
      expect(res.body.account.isInstanceAdmin).toBe(false);
      expect(res.body.organisations).toHaveLength(1);
      expect(res.body.organisations[0]).toMatchObject({ name: 'Someone', role: 'owner' });
      expect(res.body.organisations[0].id).not.toBe(DEFAULT_ORG);
      const dup = await request(open)
        .post('/api/auth/register')
        .send(signup('B@example.org'))
        .expect(409);
      expect(dup.body.error).toBe('email_taken');
    });
  });

  describe('invitations', () => {
    it('creates an account from an admin invitation, once', async () => {
      const admin = await setupAdmin(app);
      const inv = await admin
        .post(`/api/orgs/${DEFAULT_ORG}/invitations`)
        .send({ role: 'editor' })
        .expect(201);
      expect(inv.body).toMatchObject({ role: 'editor', allowsSignup: true });
      const token = String(inv.body.url).replace('/invite/', '');
      const { rows } = await pool.query('SELECT token_hash FROM invitations');
      expect(rows[0].token_hash).not.toBe(token);

      const info = await request(app).get(`/api/auth/invitations/${token}`).expect(200);
      expect(info.body).toEqual({
        organisationName: 'My organisation',
        role: 'editor',
        allowsSignup: true,
      });

      const accepted = await request(app)
        .post(`/api/auth/invitations/${token}/accept`)
        .send(signup('ed@example.org'))
        .expect(201);
      expect(accepted.body.organisations).toEqual([
        { id: DEFAULT_ORG, name: 'My organisation', role: 'editor' },
      ]);
      await request(app).get(`/api/auth/invitations/${token}`).expect(404);
      await request(app)
        .post(`/api/auth/invitations/${token}/accept`)
        .send(signup('again@example.org'))
        .expect(404);
      const listed = await admin.get(`/api/orgs/${DEFAULT_ORG}/invitations`).expect(200);
      expect(listed.body.invitations).toEqual([]);
    });

    it('rejects expired and unknown links', async () => {
      const admin = await setupAdmin(app);
      const inv = await admin.post(`/api/orgs/${DEFAULT_ORG}/invitations`).send({}).expect(201);
      const token = String(inv.body.url).replace('/invite/', '');
      await pool.query("UPDATE invitations SET expires_at = now() - interval '1 second'");
      await request(app).get(`/api/auth/invitations/${token}`).expect(404);
      await request(app)
        .post(`/api/auth/invitations/${token}/accept`)
        .send(signup('x@example.org'))
        .expect(404);
      await request(app).get('/api/auth/invitations/nonsense').expect(404);
    });

    it('lets a non-admin owner invite existing accounts only while registration is closed', async () => {
      const admin = await setupAdmin(app);
      const bob = await otherOrganisation(app, admin, 'bob@example.org');
      const inv = await bob.post(`/api/orgs/${bob.orgId}/invitations`).send({}).expect(201);
      expect(inv.body.allowsSignup).toBe(false);
      const token = String(inv.body.url).replace('/invite/', '');
      const refused = await request(app)
        .post(`/api/auth/invitations/${token}/accept`)
        .send(signup('new@example.org'))
        .expect(403);
      expect(refused.body.error).toBe('signup_not_allowed');
      // The refusal did not use the link up: an existing account can still accept it.
      const joined = await admin.post(`/api/auth/invitations/${token}/accept`).send({}).expect(200);
      expect(joined.body.organisations.map((o: { id: string }) => o.id)).toContain(bob.orgId);
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM accounts WHERE email = 'new@example.org'"
      );
      expect(rows[0].n).toBe(0);
    });

    it('tells a new account that the email is taken', async () => {
      const admin = await setupAdmin(app);
      const inv = await admin.post(`/api/orgs/${DEFAULT_ORG}/invitations`).send({}).expect(201);
      const token = String(inv.body.url).replace('/invite/', '');
      const res = await request(app)
        .post(`/api/auth/invitations/${token}/accept`)
        .send(signup('admin@example.org'))
        .expect(409);
      expect(res.body.error).toBe('email_taken');
      await request(app).get(`/api/auth/invitations/${token}`).expect(200);
    });

    it('lets owners revoke an open invitation', async () => {
      const admin = await setupAdmin(app);
      const inv = await admin.post(`/api/orgs/${DEFAULT_ORG}/invitations`).send({}).expect(201);
      await admin.delete(`/api/orgs/${DEFAULT_ORG}/invitations/${inv.body.id}`).expect(204);
      await admin.delete(`/api/orgs/${DEFAULT_ORG}/invitations/${inv.body.id}`).expect(404);
      const token = String(inv.body.url).replace('/invite/', '');
      await request(app).get(`/api/auth/invitations/${token}`).expect(404);
    });
  });

  describe('members', () => {
    it('lists, changes roles and removes, keeping one owner', async () => {
      const admin = await setupAdmin(app);
      const ed = await invite(app, admin, DEFAULT_ORG, 'ed@example.org');
      const members = await ed.get(`/api/orgs/${DEFAULT_ORG}/members`).expect(200);
      expect(members.body.members.map((m: { role: string }) => m.role).sort()).toEqual([
        'editor',
        'owner',
      ]);
      expect(JSON.stringify(members.body)).not.toContain('password');

      // Editors cannot manage members.
      await ed
        .patch(`/api/orgs/${DEFAULT_ORG}/members/${admin.accountId}`)
        .send({ role: 'editor' })
        .expect(403);
      await ed.delete(`/api/orgs/${DEFAULT_ORG}/members/${admin.accountId}`).expect(403);
      await ed.post(`/api/orgs/${DEFAULT_ORG}/invitations`).send({}).expect(403);
      await ed.get(`/api/orgs/${DEFAULT_ORG}/invitations`).expect(403);

      // The only owner cannot step down or leave.
      const last = await admin
        .patch(`/api/orgs/${DEFAULT_ORG}/members/${admin.accountId}`)
        .send({ role: 'editor' })
        .expect(409);
      expect(last.body.error).toBe('last_owner');
      await admin.delete(`/api/orgs/${DEFAULT_ORG}/members/${admin.accountId}`).expect(409);

      await admin
        .patch(`/api/orgs/${DEFAULT_ORG}/members/${ed.accountId}`)
        .send({ role: 'owner' })
        .expect(204);
      await admin
        .patch(`/api/orgs/${DEFAULT_ORG}/members/${admin.accountId}`)
        .send({ role: 'editor' })
        .expect(204);
      await ed.delete(`/api/orgs/${DEFAULT_ORG}/members/${admin.accountId}`).expect(204);
      await admin.get(`/api/orgs/${DEFAULT_ORG}/members`).expect(404);
      await ed
        .patch(`/api/orgs/${DEFAULT_ORG}/members/${ed.accountId}`)
        .send({ role: 'nope' })
        .expect(400);
      await ed
        .delete(`/api/orgs/${DEFAULT_ORG}/members/00000000-0000-4000-8000-00000000abcd`)
        .expect(404);
    });

    it('lets an editor leave', async () => {
      const admin = await setupAdmin(app);
      const ed = await invite(app, admin, DEFAULT_ORG, 'ed@example.org');
      await ed.delete(`/api/orgs/${DEFAULT_ORG}/members/${ed.accountId}`).expect(204);
      await ed.get(`/api/orgs/${DEFAULT_ORG}/projects`).expect(404);
    });

    it('lets only the instance admin create organisations while registration is closed', async () => {
      const admin = await setupAdmin(app);
      const ed = await invite(app, admin, DEFAULT_ORG, 'ed@example.org');
      await ed.post('/api/orgs').send({ name: 'Mine' }).expect(403);
      const created = await admin.post('/api/orgs').send({ name: 'Second' }).expect(201);
      expect(created.body).toMatchObject({ name: 'Second', role: 'owner' });
      await admin.post('/api/orgs').send({ name: '' }).expect(400);
    });
  });
});
