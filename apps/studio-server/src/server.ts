// SPDX-License-Identifier: AGPL-3.0-only
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDb } from './db/client.ts';
import { runMigrations } from './db/migrate.ts';

const config = loadConfig();
const { pool, db } = createDb(config.databaseUrl);

const applied = await runMigrations(pool);
if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);

const server = createApp({ config, db }).listen(config.port, config.host, () => {
  console.log(`ggraphic Studio listening on http://${config.host}:${config.port}`);
  console.log(`AI drafts: ${config.ai ? `on (${config.ai.model})` : 'off'}`);
});

function shutdown() {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
