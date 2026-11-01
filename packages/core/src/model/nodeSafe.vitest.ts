// SPDX-License-Identifier: MPL-2.0
/// <reference types="node" />
/**
 * The core is what a server loads in plain Node ESM: no editor, no React, no Konva, no icon
 * packs, no stylesheets, and no package at all (it has no dependencies). A type import counts
 * too: it pulls the other package's sources into every build that compiles the core.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

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

function foreignSpecifiers(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(SPECIFIER)) {
      const specifier = match[1]!;
      if (!ALLOWED(specifier)) found.push(`${relative(SRC, file)}: ${specifier}`);
    }
  }
  return found;
}

describe('core element model', () => {
  it('imports only other files of the core', () => {
    expect(foreignSpecifiers()).toEqual([]);
  });

  it('exposes the element model', async () => {
    const core = await import('../index.js');
    expect(core.ASSET_TARGET_SIZE).toBe(150);
    expect(core.TEXT_ALIGNS).toEqual(['left', 'center', 'right']);
  });
});
