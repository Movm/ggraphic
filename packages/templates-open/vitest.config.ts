// SPDX-License-Identifier: CC0-1.0
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
    passWithNoTests: true,
    ...(process.env['CI'] ? {} : { maxWorkers: 2 }),
  },
});
