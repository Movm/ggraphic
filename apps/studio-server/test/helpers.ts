// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import type pg from 'pg';
import request from 'supertest';
import { expect } from 'vitest';
import { type Config, loadConfig } from '../src/config.ts';

/** Config for tests. Without DATABASE_URL the pool points nowhere and is never queried. */
export function testConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = mkdtempSync(join(tmpdir(), 'studio-server-test-'));
  return {
    ...loadConfig({
      DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgres://unused@127.0.0.1:1/unused',
      DATA_DIR: dataDir,
      STATIC_DIR: join(dataDir, 'no-web-app'),
      // supertest talks plain HTTP; its cookie jar drops Secure cookies there.
      COOKIE_SECURE: 'false',
    }),
    ...overrides,
  };
}

export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export const BRAND_SETTINGS = {
  name: 'Example',
  colors: {
    primary: '#123456',
    secondary: '#abcdef',
    accent: '#FFCC00',
    accentOnLight: '#AA5500',
    attention: '#CC0000',
    textOnDark: '#FFFFFF',
    textOnLight: '#123456',
    surface: '#F5F5F5',
  },
  backgrounds: [
    { label: 'Night', color: '#123456', ink: '#FFFFFF' },
    { label: 'Paper', color: '#F5F5F5', ink: '#123456' },
  ],
  fonts: { headline: 'Raleway', body: 'PT Sans' },
};

export const WOFF2 = Buffer.concat([Buffer.from('wOF2', 'latin1'), Buffer.alloc(60, 1)]);

export const DEFAULT_ORG = '00000000-0000-4000-8000-000000000001';
export const PASSWORD = 'correct horse battery';

/** Empties every table except the migration log; keeps the default organisation. */
export async function resetDb(pool: pg.Pool): Promise<void> {
  await pool.query(
    'TRUNCATE projects, project_thumbnails, uploads, brand_packs, brand_assets, invitations, memberships, sessions, accounts CASCADE'
  );
  await pool.query('DELETE FROM organisations WHERE id <> $1', [DEFAULT_ORG]);
  await pool.query("UPDATE organisations SET name = 'My organisation'");
}

/** A logged-in browser: cookie jar plus the session's CSRF token. */
export interface Client {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  accountId: string;
  /** The first organisation of the account. */
  orgId: string;
  get(path: string): request.Test;
  post(path: string): request.Test;
  patch(path: string): request.Test;
  put(path: string): request.Test;
  delete(path: string): request.Test;
}

function client(agent: ReturnType<typeof request.agent>, body: SessionBody): Client {
  const csrf = body.csrfToken;
  return {
    agent,
    csrf,
    accountId: body.account.id,
    orgId: body.organisations[0]?.id ?? '',
    get: (path) => agent.get(path),
    post: (path) => agent.post(path).set('x-csrf-token', csrf),
    patch: (path) => agent.patch(path).set('x-csrf-token', csrf),
    put: (path) => agent.put(path).set('x-csrf-token', csrf),
    delete: (path) => agent.delete(path).set('x-csrf-token', csrf),
  };
}

interface SessionBody {
  csrfToken: string;
  account: { id: string };
  organisations: { id: string }[];
}

/** The first account of an empty instance: instance admin, owner of the default org. */
export async function setupAdmin(app: Express, email = 'admin@example.org'): Promise<Client> {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/setup')
    .send({ email, displayName: 'Admin', password: PASSWORD });
  expect(res.status).toBe(201);
  return client(agent, res.body as SessionBody);
}

/** A new account that joined `orgId` through an invitation created by `owner`. */
export async function invite(
  app: Express,
  owner: Client,
  orgId: string,
  email: string,
  role: 'owner' | 'editor' = 'editor'
): Promise<Client> {
  const inv = await owner.post(`/api/orgs/${orgId}/invitations`).send({ role });
  expect(inv.status).toBe(201);
  const token = String(inv.body.url).split('/').pop();
  const agent = request.agent(app);
  const res = await agent
    .post(`/api/auth/invitations/${token}/accept`)
    .send({ email, displayName: email.split('@')[0], password: PASSWORD });
  expect(res.status).toBe(201);
  return client(agent, res.body as SessionBody);
}

/** A second organisation, created by the admin, with `email` as its only owner. */
export async function otherOrganisation(
  app: Express,
  admin: Client,
  email: string
): Promise<Client> {
  const org = await admin.post('/api/orgs').send({ name: 'Other' });
  expect(org.status).toBe(201);
  const member = await invite(app, admin, org.body.id as string, email, 'owner');
  // The admin created it and is owner too; leave so only `email` remains.
  await admin.delete(`/api/orgs/${org.body.id}/members/${admin.accountId}`).expect(204);
  return { ...member, orgId: org.body.id as string };
}
