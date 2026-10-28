// SPDX-License-Identifier: AGPL-3.0-only
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The Docker image installs only `dependencies` (pnpm deploy --prod). A value
// import of a package listed under devDependencies passes every test here and
// then crashes the container at startup with ERR_MODULE_NOT_FOUND.
const ROOT = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [full] : [];
  });
}

const packageName = (specifier: string) =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');

const VALUE_IMPORTS = [
  // `import type` / `export type` lines are erased by tsc and never load at runtime.
  /^\s*(?:import|export)\s+(?!type\s)[^'"]*?from\s+'([^'.][^']*)'/gm,
  /^\s*import\s+'([^'.][^']*)'/gm,
  /\bimport\(\s*'([^'.][^']*)'\s*\)/g,
];

/** Bare specifiers the module imports as values. */
const runtimeImports = (source: string): string[] =>
  VALUE_IMPORTS.flatMap((re) => [...source.matchAll(re)].flatMap((m) => (m[1] ? [m[1]] : [])));

describe('studio-server runtime dependencies', () => {
  it('lists every package imported as a value in dependencies', () => {
    const declared = new Set(Object.keys(manifest.dependencies ?? {}));
    const builtins = new Set(builtinModules);
    const missing = new Set<string>();
    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
      for (const specifier of runtimeImports(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('node:') || builtins.has(specifier)) continue;
        const name = packageName(specifier);
        if (!declared.has(name)) missing.add(`${name} (${path.relative(ROOT, file)})`);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
