#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
/**
 * Package gate on the tarballs npm would receive: `pnpm pack` for every published package under
 * packages/ (so publishConfig and `files` apply), then publint and attw on each tarball. Fails
 * when either finds a problem.
 *
 * - publint runs with --strict: its warnings count as errors.
 * - attw runs with the esm-only profile. The packages ship ESM only and declare no CommonJS
 *   entry, so a `require()` of them failing (node10, node16 from CJS) is by design, not a bug.
 *   Stylesheet entries are excluded: attw looks for type declarations behind every entry, and
 *   a `.css` file has none. A `./*` wildcard entry is listed by attw but not analysed.
 *
 * Needs the packages built (`pnpm build`) and node_modules.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => join(ROOT, 'node_modules', '.bin', name);

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim() };
}

const cssEntries = (manifest) =>
  Object.entries(manifest.publishConfig?.exports ?? manifest.exports ?? {})
    .filter(([, value]) => typeof value === 'string' && value.endsWith('.css'))
    .map(([key]) => key);

const outDir = mkdtempSync(join(tmpdir(), 'ggraphic-packed-'));
const failures = [];
try {
  for (const name of readdirSync(join(ROOT, 'packages')).sort()) {
    const pkgDir = join(ROOT, 'packages', name);
    if (!existsSync(join(pkgDir, 'package.json'))) continue;
    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    if (manifest.private) continue;
    const before = new Set(readdirSync(outDir));
    execFileSync('pnpm', ['pack', '--pack-destination', outDir], { cwd: pkgDir, stdio: 'ignore' });
    const tarball = join(
      outDir,
      readdirSync(outDir).find((f) => !before.has(f))
    );

    const publint = run(bin('publint'), ['run', tarball, '--strict']);
    const css = cssEntries(manifest);
    const attw = run(bin('attw'), [
      tarball,
      '--profile',
      'esm-only',
      '--format',
      'ascii',
      ...(css.length ? ['--exclude-entrypoints', ...css] : []),
    ]);
    console.log(
      `${manifest.name}: publint ${publint.ok ? 'ok' : 'FAILED'}, attw ${attw.ok ? 'ok' : 'FAILED'}`
    );
    for (const [tool, result] of [
      ['publint', publint],
      ['attw', attw],
    ]) {
      if (result.ok) continue;
      console.log(result.output);
      console.log(`::error title=${tool}::${manifest.name} fails ${tool}; see the log above.`);
      failures.push(`${manifest.name}: ${tool}`);
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
if (failures.length) {
  console.error(`\nPackage checks failed: ${failures.join(', ')}`);
  process.exitCode = 1;
}
