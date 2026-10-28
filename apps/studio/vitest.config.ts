// SPDX-License-Identifier: AGPL-3.0-only
import { createRequire } from 'node:module';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const resolvePackage = (name: string) =>
  path.dirname(createRequire(import.meta.url).resolve(`${name}/package.json`));
const schemaSrc = path.resolve(import.meta.dirname, '../../packages/schema/src');
const uiSrc = path.resolve(import.meta.dirname, '../../packages/ui/src/index.ts');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@ggraphic\/schema(\/.*)?$/, replacement: `${schemaSrc}$1` },
      { find: /^@ggraphic\/ui$/, replacement: uiSrc },
      // One React for the app, the editor and react-query.
      { find: /^react$/, replacement: resolvePackage('react') },
      { find: /^react-dom$/, replacement: resolvePackage('react-dom') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    server: { deps: { inline: ['@tanstack/react-query'] } },
    // The editor smoke test mounts the whole editor.
    testTimeout: 30_000,
  },
});
