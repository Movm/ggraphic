// SPDX-License-Identifier: MPL-2.0
/**
 * Writes `dist/vendor/pptxgen.js`: pptxgenjs and what it pulls in (JSZip and its dependencies),
 * bundled for the browser into one ESM file (#133). The published package maps `#pptxgenjs`
 * there (publishConfig.imports); in development `#pptxgenjs` is the npm package.
 *
 * Why: pptxgenjs 4.0.1 loads `node:fs` and `node:https` with `import()`. Its `browser` field maps
 * them to `false`, but webpack rejects the `node:` scheme before it reads that field, so every
 * webpack host failed to build the embed entry. Bundled with `platform: 'browser'`, the mapping
 * applies and the Node branches (writing files, fetching image paths) drop out; the editor never
 * uses them (data URLs in, `write({ outputType: 'arraybuffer' })` out).
 *
 * Also writes the types next to it (`pptxgen.d.ts`, pptxgenjs's own) and the licence texts of
 * every bundled package (`pptxgen.LICENSES.txt`). Fails the build when the output still loads
 * anything (a `node:` specifier or a bare import), or a bundled package has a licence outside
 * the allow-list of scripts/check-licences.mjs or ships no licence text.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'rolldown';

import { expressionAllowed } from '../../../scripts/check-licences.mjs';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'dist/vendor');
const entry = fileURLToPath(import.meta.resolve('pptxgenjs'));

/** `…/node_modules/<name>/…` → the package directory, the last node_modules segment. */
function packageDirOf(file) {
  const parts = file.split(path.sep);
  const at = parts.lastIndexOf('node_modules');
  if (at < 0) return null;
  const length = parts[at + 1].startsWith('@') ? 3 : 2;
  return parts.slice(0, at + length).join(path.sep);
}

const result = await build({
  input: entry,
  platform: 'browser',
  logLevel: 'warn',
  write: false,
  output: { format: 'esm', codeSplitting: false },
});
const [chunk, ...rest] = result.output;
if (rest.some((file) => file.type === 'chunk') || chunk.type !== 'chunk')
  throw new Error('bundle-pptxgen: expected exactly one chunk');

// Whatever the bundle still loads would be resolved by the host's bundler, which is the problem.
const loads = [
  ...chunk.code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g),
].map((match) => match[1]);
if (loads.length > 0)
  throw new Error(`bundle-pptxgen: the bundle still loads ${[...new Set(loads)].join(', ')}`);
if (/["']node:/.test(chunk.code))
  throw new Error('bundle-pptxgen: the bundle still names a node: module');

const packages = new Map();
for (const id of chunk.moduleIds) {
  // `\0…` ids are rolldown's own modules, e.g. the empty stand-in for a `browser: false` entry.
  if (id.startsWith('\0')) continue;
  const dir = packageDirOf(id);
  if (dir && !packages.has(dir))
    packages.set(dir, JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')));
}

// JSZip's `browser` entry is its own prebuilt bundle (`dist/jszip.min.js`), which already contains
// its dependencies (pako, lie, …). They don't show up as modules, so add its dependency closure.
const PREBUILT = new Set(['jszip']);
const addDependencies = (dir, pkg) => {
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    const require = createRequire(path.join(dir, 'package.json'));
    const child = path.dirname(require.resolve(`${name}/package.json`));
    if (packages.has(child)) continue;
    const childPkg = JSON.parse(readFileSync(path.join(child, 'package.json'), 'utf8'));
    packages.set(child, childPkg);
    addDependencies(child, childPkg);
  }
};
for (const [dir, pkg] of [...packages]) if (PREBUILT.has(pkg.name)) addDependencies(dir, pkg);

// Packages that ship their licence text only in the README's "License" section. Keyed by exact
// version, so a bump fails until someone has looked again.
const LICENCE_IN_README = new Set(['isarray@1.0.0']);

/** The licence text a package ships: a LICENSE/COPYING file, or the README section above. */
function licenceText(dir, id) {
  const file = readdirSync(dir).find((name) => /^(licen[sc]e|copying)/i.test(name));
  if (file) return readFileSync(path.join(dir, file), 'utf8').trim();
  if (!LICENCE_IN_README.has(id)) return null;
  const readme = readFileSync(path.join(dir, 'README.md'), 'utf8');
  return /^#+\s*License\s*$([\s\S]*)/im.exec(readme)?.[1].trim() ?? null;
}

const problems = [];
const licences = [];
for (const [dir, pkg] of [...packages].sort(([, a], [, b]) => a.name.localeCompare(b.name))) {
  const id = `${pkg.name}@${pkg.version}`;
  if (typeof pkg.license !== 'string' || !expressionAllowed(pkg.license))
    problems.push(`${id}: licence ${JSON.stringify(pkg.license)} is not allowed`);
  const text = licenceText(dir, id);
  if (!text) problems.push(`${id}: no licence text`);
  else licences.push(`${id} (${pkg.license})\n\n${text}`);
}
if (problems.length > 0) throw new Error(`bundle-pptxgen:\n  ${problems.join('\n  ')}`);

const pptxgen = [...packages.values()].find((pkg) => pkg.name === 'pptxgenjs');
const banner =
  `/*! pptxgenjs ${pptxgen.version} with its dependencies, bundled for the browser by ` +
  '@ggraphic/editor. Licences: pptxgen.LICENSES.txt (JSZip is used under MIT). */\n';

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'pptxgen.js'), banner + chunk.code);
copyFileSync(
  path.join(path.dirname(entry), '../types/index.d.ts'),
  path.join(outDir, 'pptxgen.d.ts')
);
writeFileSync(
  path.join(outDir, 'pptxgen.LICENSES.txt'),
  `Packages bundled into pptxgen.js, with their licence texts. JSZip is dual-licensed\n` +
    `(MIT OR GPL-3.0-or-later); @ggraphic/editor uses it under the MIT licence.\n\n` +
    licences.join(`\n\n${'-'.repeat(72)}\n\n`) +
    '\n'
);
console.log(
  `bundle-pptxgen: dist/vendor/pptxgen.js, ${packages.size} packages: ` +
    [...packages.values()].map((pkg) => pkg.name).join(', ')
);
