// SPDX-License-Identifier: AGPL-3.0-only
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The point of this package: a host gets the sidebar chrome without the canvas editor.
const FORBIDDEN =
  /^(konva|react-konva|yjs|y-protocols|@tiptap\/|@ggraphic\/(core|schema|editor|collab)(\/|$))/;

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Record<
  string,
  Record<string, string> | undefined
>;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|css)$/.test(name) && !/\.vitest\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('package boundary', () => {
  it('declares no editor-core dependency', () => {
    const declared = ['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap((key) =>
      Object.keys(pkg[key] ?? {})
    );
    expect(declared.filter((name) => FORBIDDEN.test(name))).toEqual([]);
  });

  it('imports nothing from the editor core or outside the package', () => {
    const bad: string[] = [];
    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        if (FORBIDDEN.test(spec) || spec.startsWith('../../'))
          bad.push(`${path.relative(ROOT, file)}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('declares a default in tokens.css for every custom property the components read', () => {
    const tokens = readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf8');
    const declared = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    // Written by SidebarPanel itself.
    const setHere = new Set(['--sheet-rest-bottom']);
    const missing = new Set<string>();
    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
      if (file.endsWith('tokens.css')) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!declared.has(m[1]) && !setHere.has(m[1])) missing.add(m[1]);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
