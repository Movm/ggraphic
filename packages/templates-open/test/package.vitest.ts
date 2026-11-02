// SPDX-License-Identifier: CC0-1.0
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import pkg from '../package.json' with { type: 'json' };
import samples from '../src/samples/samples.json' with { type: 'json' };

const PKG = join(import.meta.dirname, '..');

/** Every file reachable from `entry` through relative static imports and re-exports. */
function moduleGraph(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!file.endsWith('.js')) return;
    for (const m of readFileSync(file, 'utf8').matchAll(/\bfrom\s+(["'])(\.{1,2}\/[^"']+)\1/g))
      visit(join(dirname(file), m[2]!));
  };
  visit(entry);
  return [...seen].map((f) => relative(PKG, f)).sort();
}

describe('the published package', () => {
  beforeAll(() => {
    execFileSync('pnpm', ['run', 'build'], { cwd: PKG, stdio: 'ignore' });
  }, 120_000);

  // The sample photos are loaded with `new URL('./<file>', import.meta.url)`, so the built
  // `dist/samples/index.js` needs each file next to it; tsc copies only code and JSON.
  it('ships every sample photo next to the built index', () => {
    const [pack] = JSON.parse(
      execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: PKG, encoding: 'utf8' })
    ) as { files: { path: string }[] }[];
    const shipped = new Set(pack!.files.map((f) => f.path));
    for (const row of samples.photos) expect(shipped).toContain(`dist/samples/${row.file}`);
    expect(shipped).toContain('dist/samples/index.js');
  }, 120_000);

  // A bundler emits an asset for every `new URL(..., import.meta.url)` it can reach, so a host
  // importing the root would carry all the photos (#135). They load only through `./photos`.
  it('keeps the photos out of the root entry', () => {
    const graph = moduleGraph(join(PKG, pkg.publishConfig.exports['.'].import));
    expect(graph).toContain('dist/index.js');
    for (const file of graph) {
      expect(file).not.toMatch(/^dist\/samples\//);
      expect(readFileSync(join(PKG, file), 'utf8'), file).not.toContain('import.meta.url');
    }
  });

  it('loads the photos through the ./photos subpath', () => {
    const graph = moduleGraph(join(PKG, pkg.publishConfig.exports['./photos'].import));
    const urls = readFileSync(join(PKG, 'dist/samples/index.js'), 'utf8');
    expect(graph).toContain('dist/samples/index.js');
    for (const row of samples.photos) expect(urls).toContain(`new URL('./${row.file}'`);
  });
});
