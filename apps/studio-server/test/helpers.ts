// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Config, loadConfig } from '../src/config.ts';

/** Config for tests. Without DATABASE_URL the pool points nowhere and is never queried. */
export function testConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = mkdtempSync(join(tmpdir(), 'studio-server-test-'));
  return {
    ...loadConfig({
      DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgres://unused@127.0.0.1:1/unused',
      DATA_DIR: dataDir,
      STATIC_DIR: join(dataDir, 'no-web-app'),
    }),
    ...overrides,
  };
}

export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
