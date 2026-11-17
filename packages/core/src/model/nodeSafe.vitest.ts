// SPDX-License-Identifier: AGPL-3.0-only
/// <reference types="node" />
/**
 * The core is what a server loads in plain Node ESM: no editor, no React, no Konva, no icon
 * packs, no stylesheets, and no package at all (it has no dependencies). A type import counts
 * too: it pulls the other package's sources into every build that compiles the core.
 *
 * The one exception is `yjs`, the optional peer of the `@ggraphic/core/ydoc` entry: allowed
 * only in files under `src/ydoc/`, and the root entry must not reach them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const YDOC = join(SRC, 'ydoc');

/** The only package the core may import, and only from files under `src/ydoc/`. */
const YDOC_PEER = 'yjs';
const inYdoc = (file: string) => file.startsWith(YDOC + sep);

/** Another file of the core, and code: `./x.js` is fine, `./x.css` or `./x.json` is not. */
const ALLOWED = (specifier: string) =>
  (specifier.startsWith('./') || specifier.startsWith('../')) && /\.(js|ts)$/.test(specifier);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.vitest.ts') ? [path] : [];
  });
}

// `import x from 'y'`, `export { x } from 'y'`, `import 'y'` and `import('y')`.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;

const specifiersOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].map((match) => match[1]!);

function foreignSpecifiers(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    for (const specifier of specifiersOf(file)) {
      if (ALLOWED(specifier)) continue;
      if (specifier === YDOC_PEER && inYdoc(file)) continue;
      found.push(`${relative(SRC, file)}: ${specifier}`);
    }
  }
  return found;
}

/** Every source file an entry reaches through relative imports, and every bare specifier. */
function importGraph(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    for (const specifier of specifiersOf(file)) {
      if (!specifier.startsWith('.')) {
        packages.add(specifier);
        continue;
      }
      visit(resolve(dirname(file), specifier).replace(/\.js$/, '.ts'));
    }
  };
  visit(entry);
  return { files: [...files].map((file) => relative(SRC, file)), packages: [...packages] };
}

describe('core element model', () => {
  it('imports only other files of the core', () => {
    expect(foreignSpecifiers()).toEqual([]);
  });

  it('keeps the root entry away from src/ydoc/ and its peer', () => {
    const { files, packages } = importGraph(join(SRC, 'index.ts'));
    expect(files.filter((file) => file.startsWith(`ydoc${sep}`))).toEqual([]);
    expect(packages).toEqual([]);
  });

  it('lets the ydoc entry load yjs and core files only', () => {
    const { files, packages } = importGraph(join(YDOC, 'index.ts'));
    expect(packages).toEqual([YDOC_PEER]);
    expect(files.every((file) => !file.startsWith('..'))).toBe(true);
  });

  it('lets the internal ydoc entry load yjs and core files only, and keeps it out of the ydoc entry', () => {
    const { files, packages } = importGraph(join(YDOC, 'internal.ts'));
    expect(packages).toEqual([YDOC_PEER]);
    expect(files.every((file) => !file.startsWith('..'))).toBe(true);
    expect(importGraph(join(YDOC, 'index.ts')).files).not.toContain(`ydoc${sep}internal.ts`);
  });

  it('red probe: the graph walk sees a package import', () => {
    expect(importGraph(join(YDOC, 'codec.ts')).packages).toContain(YDOC_PEER);
  });

  it('loads the ydoc entry in plain Node, without a DOM', async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    const ydoc = await import('../ydoc/index.js');
    expect(ydoc.YDOC_KEYS.pagesById).toBe('pagesById');
  });

  it('exposes the element model', async () => {
    const core = await import('../index.js');
    expect(core.ASSET_TARGET_SIZE).toBe(150);
    expect(core.TEXT_ALIGNS).toEqual(['left', 'center', 'right']);
  });
});
