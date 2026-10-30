// SPDX-License-Identifier: AGPL-3.0-only
// Templates an owner hides for the organisation. Needs a real Postgres (DATABASE_URL).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { createDb } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import {
  type Client,
  DEFAULT_ORG,
  memberOf,
  otherOrganisation,
  resetDb,
  setupAdmin,
  testConfig,
} from './helpers.ts';

const hasDb = Boolean(process.env['DATABASE_URL']);
const base = `/api/orgs/${DEFAULT_ORG}/hidden-templates`;

describe.skipIf(!hasDb)('hidden templates (Postgres)', () => {
  const config = testConfig();
  const { pool, db } = createDb(config.databaseUrl);
  let app = createApp({ config, db });
  let owner: Client;
  let editor: Client;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await resetDb(pool);
    await pool.query('TRUNCATE hidden_templates');
    app = createApp({ config, db });
    owner = await setupAdmin(app);
    editor = await memberOf(app, pool, DEFAULT_ORG, 'ed@example.org');
  });
  afterAll(async () => {
    await pool.end();
  });

  it('members read the hidden list', async () => {
    expect((await editor.get(base).expect(200)).body).toEqual({ templateIds: [] });
    await owner.put(`${base}/studio-quote`).send({ hidden: true }).expect(204);
    await owner.put(`${base}/studio-headline`).send({ hidden: true }).expect(204);
    const res = await editor.get(base).expect(200);
    expect(res.body).toEqual({ templateIds: ['studio-headline', 'studio-quote'] });
  });

  it('an editor may not hide (403)', async () => {
    await editor.put(`${base}/studio-quote`).send({ hidden: true }).expect(403);
    expect((await owner.get(base).expect(200)).body).toEqual({ templateIds: [] });
  });

  it('an owner hides and unhides idempotently', async () => {
    await owner.put(`${base}/studio-quote`).send({ hidden: true }).expect(204);
    await owner.put(`${base}/studio-quote`).send({ hidden: true }).expect(204);
    expect((await owner.get(base)).body).toEqual({ templateIds: ['studio-quote'] });
    const { rows } = await pool.query<{ hidden_by: string }>(
      'SELECT hidden_by FROM hidden_templates'
    );
    expect(rows).toEqual([{ hidden_by: owner.accountId }]);
    await owner.put(`${base}/studio-quote`).send({ hidden: false }).expect(204);
    await owner.put(`${base}/studio-quote`).send({ hidden: false }).expect(204);
    expect((await owner.get(base)).body).toEqual({ templateIds: [] });
  });

  it('a malformed template id is 400', async () => {
    for (const id of ['Studio-Quote', 'a_b', '-a', 'a--b', 'a'.repeat(65)]) {
      await owner.put(`${base}/${id}`).send({ hidden: true }).expect(400);
    }
    await owner
      .put(`${base}/${'a'.repeat(64)}`)
      .send({ hidden: true })
      .expect(204);
    await owner.put(`${base}/studio-quote`).send({ hidden: 'yes' }).expect(400);
  });

  it('the list of another organisation is 404', async () => {
    const bob = await otherOrganisation(app, pool, 'bob@example.org');
    await bob.get(base).expect(404);
    await bob.put(`${base}/studio-quote`).send({ hidden: true }).expect(404);
    expect((await owner.get(base)).body).toEqual({ templateIds: [] });
  });
});
