// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
    ...(process.env['CI'] ? {} : { maxWorkers: 2 }),
  },
});
