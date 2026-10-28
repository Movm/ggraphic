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

export default defineConfig({
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
    ],
    // One React: @tanstack/react-query and the editor must not bring their own copy.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    // The Studio server; same origin for the browser, it has no CORS.
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  build: {
    outDir: 'dist',
    // The editor is one large chunk by design; it loads only on the editor route.
    chunkSizeWarningLimit: 6000,
  },
});
