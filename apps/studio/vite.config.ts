// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const schemaSrc = path.resolve(import.meta.dirname, '../../packages/schema/src');
const uiSrc = path.resolve(import.meta.dirname, '../../packages/ui/src/index.ts');
const templatesOpenSrc = path.resolve(
  import.meta.dirname,
  '../../packages/templates-open/src/index.ts'
);
// The test brands the render gate draws with; reachable only through this alias, which the
// production build never imports (nothing in `src/` outside `src/gate/` names it).
const testBrandsSrc = path.resolve(
  import.meta.dirname,
  '../../packages/templates-open/test/testBrands.ts'
);

/**
 * `vite build --mode gate` (with `NODE_ENV=development`) builds the render gate's own entries into
 * `dist-gate`, and `vite preview --mode gate` serves them. The gate used to run on the dev server,
 * whose transform middleware crashed V8 while sending the multi-MB editor module (#109).
 */
const GATE_MODE = 'gate';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    // @ggraphic/schema points `import` at a dist nobody builds in the workspace; read its source,
    // as the editor's own lanes do (they resolve the `development` condition).
    // @ggraphic/ui likewise points `import` at an unbuilt dist; its CSS subpaths resolve as exported.
    // @ggraphic/templates-open too: the image builds apps/studio alone, never the pack's dist.
    alias: [
      { find: /^@ggraphic\/schema(\/.*)?$/, replacement: `${schemaSrc}$1` },
      { find: /^@ggraphic\/ui$/, replacement: uiSrc },
      { find: /^@ggraphic\/templates-open$/, replacement: templatesOpenSrc },
      { find: /^@ggraphic\/templates-open\/test\/testBrands$/, replacement: testBrandsSrc },
    ],
    // One React: @tanstack/react-query and the editor must not bring their own copy.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    // The Studio server; same origin for the browser, it has no CORS.
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  build:
    mode === GATE_MODE
      ? {
          outDir: 'dist-gate',
          rollupOptions: {
            input: {
              gate: path.resolve(import.meta.dirname, 'gate.html'),
              compiled: path.resolve(import.meta.dirname, 'compiled.html'),
            },
          },
          chunkSizeWarningLimit: 6000,
          // Unminified, so `e2e/compiledCss.spec.ts` can compare the served rules with the
          // editor's compiled.css; the minifier merges and rewrites `@layer` blocks.
          cssMinify: false,
        }
      : {
          outDir: 'dist',
          // One page. `gate.html` (the render gate) and `compiled.html` are test entries with a
          // build of their own (`--mode gate`); naming the input keeps them out of this build, and
          // `e2e/renderGate.spec.ts` builds to prove it.
          rollupOptions: { input: path.resolve(import.meta.dirname, 'index.html') },
          // The editor is one large chunk by design; it loads only on the editor route.
          chunkSizeWarningLimit: 6000,
        },
}));
