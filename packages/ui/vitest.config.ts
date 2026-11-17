// SPDX-License-Identifier: AGPL-3.0-only
import { createRequire } from 'node:module';
import path from 'node:path';

import { defineConfig } from 'vitest/config';

const resolvePackage = (name: string) =>
  path.dirname(createRequire(import.meta.url).resolve(`${name}/package.json`));

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: { react: resolvePackage('react'), 'react-dom': resolvePackage('react-dom') },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.vitest.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
