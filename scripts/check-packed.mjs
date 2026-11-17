#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
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
 * - Our own check on the unpacked files (#133):
 *   - No JavaScript file under dist contains a `node:` string (an import, `import()`, `require()`
 *     or rolldown's `__require()` shim, or a specifier built elsewhere). webpack rejects the
 *     `node:` scheme in a browser build, even in a lazy chunk.
 *   - Every bare import under dist names the package itself or one of its dependencies or peers.
 *     A dependency that moved to devDependencies, as pptxgenjs did when it was bundled into
 *     dist/vendor, would otherwise still be imported and fail in every host.
 *   - Files under dist/vendor are bundles: they may load nothing at all, not even a declared
 *     package or a Node built-in by its bare name (`fs`, `https`).
 *   - Every target of the manifest's `imports` map is in the tarball.
 *
 * Needs the packages built (`pnpm build`) and node_modules.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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

const NODE_STRING = /["'`]node:[a-z][a-z_/]*/;

/** The module specifiers a compiled ES module loads, read in the shape tsc emits them. */
function specifiers(code) {
  const patterns = [
    // No quote or `=` before `from`: `export const x = { a: 'from' }` is no import.
    /^\s*(?:import|export)\s[^;'"=]*?\bfrom\s*["']([^"']+)["']/gm,
    /^\s*import\s*["']([^"']+)["']/gm,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\b(?:__)?require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...code.matchAll(pattern)].map((match) => match[1]));
}

const packageName = (specifier) =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');

/** Every file under `dir`, as paths relative to it. */
const filesIn = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1));

/** Problems of the unpacked tarball: see the third point at the top. */
function checkUnpacked(tarball) {
  const dir = `${tarball}.d`;
  mkdirSync(dir);
  execFileSync('tar', ['-xzf', tarball, '-C', dir]);
  const pkg = join(dir, 'package');
  const files = filesIn(pkg);
  const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  const declared = new Set([
    manifest.name,
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  const problems = [];
  for (const file of files.filter((f) => f.startsWith('dist/') && /\.m?js$/.test(f))) {
    const code = readFileSync(join(pkg, file), 'utf8');
    const node = NODE_STRING.exec(code);
    if (node) problems.push(`${file} names ${node[0]}`);
    if (file.startsWith('dist/vendor/')) {
      for (const specifier of specifiers(code))
        problems.push(`${file} is a bundle but loads ${specifier}`);
      continue;
    }
    for (const specifier of specifiers(code)) {
      if (/^[.#/]|^node:/.test(specifier)) continue;
      if (!declared.has(packageName(specifier)))
        problems.push(`${file} imports ${specifier}, which the manifest does not declare`);
    }
  }
  const targets = (value) =>
    typeof value === 'string' ? [value] : Object.values(value ?? {}).flatMap(targets);
  for (const [key, value] of Object.entries(manifest.imports ?? {}))
    for (const target of targets(value))
      if (target.startsWith('./') && !files.includes(target.slice(2)))
        problems.push(`imports ${key} → ${target} is not in the tarball`);
  return { ok: problems.length === 0, output: problems.join('\n') };
}

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
    const unpacked = checkUnpacked(tarball);
    console.log(
      `${manifest.name}: publint ${publint.ok ? 'ok' : 'FAILED'}, attw ${attw.ok ? 'ok' : 'FAILED'}, ` +
        `files ${unpacked.ok ? 'ok' : 'FAILED'}`
    );
    for (const [tool, result] of [
      ['publint', publint],
      ['attw', attw],
      ['files', unpacked],
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
