// SPDX-License-Identifier: AGPL-3.0-only
import { count } from 'drizzle-orm';
import { createApp } from './app.ts';
import { randomToken } from './auth/tokens.ts';
import { loadConfig } from './config.ts';
import { createDb } from './db/client.ts';
import { accounts } from './db/schema.ts';
import { runMigrations } from './db/migrate.ts';
import { adoptLegacyUploads } from './legacyUploads.ts';

const config = loadConfig();
if (config.allowInsecureCookie) {
  console.warn(
    '\n  WARNING: COOKIE_SECURE=false on a non-loopback HOST (ALLOW_INSECURE_COOKIE=1).\n  Session cookies travel over plain HTTP and can be stolen on the network.\n  Use HTTPS and COOKIE_SECURE=true for anything but a closed test setup.\n'
  );
}
const { pool, db } = createDb(config.databaseUrl);

const applied = await runMigrations(pool);
if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);
const adopted = await adoptLegacyUploads(db, config.uploadDir);
if (adopted > 0) console.log(`Registered ${adopted} existing uploads to the default organisation`);

// First run: whoever presents this token creates the admin account. Printed once, never again.
const [existing] = await db.select({ n: count() }).from(accounts);
if ((existing?.n ?? 0) > 0) {
  config.setupToken = null;
} else {
  const generated = config.setupToken === null;
  config.setupToken ??= randomToken();
  console.log(
    generated
      ? `\n  First run: open Studio and enter this setup token to create the admin account:\n\n    ${config.setupToken}\n\n  It is shown only now and works once.\n`
      : '\n  First run: open Studio and enter the SETUP_TOKEN from your environment to create the admin account.\n'
  );
}

const server = createApp({ config, db }).listen(config.port, config.host, () => {
  console.log(`ggraphic Studio listening on http://${config.host}:${config.port}`);
  console.log(`AI drafts: ${config.ai ? `on (${config.ai.model})` : 'off'}`);
  console.log(`Self-registration: ${config.allowRegistration ? 'open' : 'closed'}`);
});

function shutdown() {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
