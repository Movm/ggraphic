#!/usr/bin/env node
/**
 * Licence gate for the packages that will be published as @ggraphic/* under
 * MPL-2.0 (packages/schema, core, editor). Walks the production
 * dependency tree (dependencies, peerDependencies, optionalDependencies — not
 * devDependencies) from the installed node_modules and fails when any package
 * declares a licence outside ALLOWED, or none. @iconify-json/* sets must also
 * be allowed in their info.json: the package.json can say MIT while the icon
 * data carries a different licence (Remix Icon changed its licence at 4.9.0).
 *
 * Bundled files: every directory of graphics the Studio ships under
 * apps/studio/public (`/emoji`, `/illustrations/<set>`) and the sample photos of
 * packages/templates-open/src/samples (whose samples.json rows are checked too) need a row in
 * THIRD_PARTY_NOTICES.md that names it in backticks and carries an allowed
 * licence. A set with no row, or one under a licence outside ALLOWED, fails.
 * This part reads files only and needs no node_modules.
 *
 * It also fails when a tracked source file under apps/, packages/ or examples/ lacks an
 * SPDX-License-Identifier line in its first lines, or names another licence than the
 * package it sits in declares.
 *
 * Needs node_modules (runs on the typecheck job). No dependencies.
 * `--self-test` builds fixture trees and runs the red probes; needs no install.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'MPL-2.0',
  'CC0-1.0',
  'OFL-1.1',
  'Zlib',
]);

export const ROOT_PACKAGES = [
  'schema',
  'core',
  'editor',
  'collab',
  'ui',
  'ai',
  'templates-open',
  'brand-default',
];

// Packages whose manifest declares no licence although they ship one. Keyed by exact
// version, so a bump falls back to the manifest and needs a fresh look.
const VERIFIED_LICENSES = new Map([
  // LICENSE.md is the MIT text; package.json and the registry carry no `license`.
  ['react-kawaii@1.6.0', 'MIT'],
]);

/** True when an SPDX expression is composed only of allowed ids. OR needs one side, AND both. */
export function expressionAllowed(expression) {
  const tokens = expression
    .replace(/([()])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);
  let pos = 0;
  const parseOr = () => {
    let ok = parseAnd();
    while (tokens[pos] === 'OR') {
      pos++;
      const right = parseAnd();
      ok = ok || right;
    }
    return ok;
  };
  const parseAnd = () => {
    let ok = parseAtom();
    while (tokens[pos] === 'AND') {
      pos++;
      const right = parseAtom();
      ok = ok && right;
    }
    return ok;
  };
  const parseAtom = () => {
    const token = tokens[pos++];
    if (token === '(') {
      const ok = parseOr();
      if (tokens[pos++] !== ')') throw new Error('unbalanced');
      return ok;
    }
    return token !== undefined && ALLOWED.has(token);
  };
  try {
    const ok = parseOr();
    return ok && pos === tokens.length;
  } catch {
    return false;
  }
}

function declaredLicense(pkg) {
  const lic = pkg.license ?? pkg.licenses;
  if (typeof lic === 'string') return lic;
  if (lic && typeof lic === 'object' && !Array.isArray(lic)) return lic.type ?? null;
  if (Array.isArray(lic) && lic.length > 0) {
    const types = lic.map((l) => (typeof l === 'string' ? l : l?.type));
    return types.every(Boolean) ? types.join(' OR ') : null;
  }
  return null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Node resolution from the real dir of the requiring package. */
function resolveDep(fromDir, name) {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Returns a list of { path, message } problems for the given root package dirs. */
export function checkLicenses(rootDirs) {
  const problems = [];
  const seen = new Set();
  const visit = (dir, trail) => {
    const pkg = readJson(join(dir, 'package.json'));
    if (!pkg) return;
    const id = `${pkg.name}@${pkg.version}`;
    if (seen.has(dir)) return;
    seen.add(dir);
    const label = trail.join(' > ');
    const isRoot = trail.length === 1;
    if (!isRoot) {
      const license = declaredLicense(pkg) ?? VERIFIED_LICENSES.get(id) ?? null;
      if (!license) problems.push({ path: label, message: `${id}: no license field` });
      else if (!expressionAllowed(license))
        problems.push({ path: label, message: `${id}: license "${license}" is not allowed` });
    }
    if (pkg.name?.startsWith('@iconify-json/')) {
      const info = readJson(join(dir, 'info.json'));
      const spdx = info?.license?.spdx ?? null;
      if (!spdx || !expressionAllowed(spdx))
        problems.push({
          path: label,
          message: `${id}: icon data licence "${spdx ?? 'missing'}" (info.json) is not allowed`,
        });
    }
    const optionalPeers = new Set(
      Object.entries(pkg.peerDependenciesMeta ?? {})
        .filter(([, meta]) => meta?.optional)
        .map(([name]) => name)
    );
    const names = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]);
    for (const name of names) {
      const child = resolveDep(dir, name);
      if (!child) {
        const optional =
          optionalPeers.has(name) || (pkg.optionalDependencies ?? {})[name] !== undefined;
        if (!optional)
          problems.push({ path: `${label} > ${name}`, message: `${name} is not installed` });
        continue;
      }
      visit(child, [...trail, name]);
    }
  };
  for (const dir of rootDirs) {
    const pkg = readJson(join(dir, 'package.json'));
    visit(realpathSync(dir), [pkg?.name ?? dir]);
  }
  return { problems, count: seen.size };
}

const NOTICES_FILE = 'THIRD_PARTY_NOTICES.md';
// Never bundled, whatever a notices row says.
const FORBIDDEN_SETS = ['undraw', 'unsplash', 'fontawesome', 'font-awesome'];

const subdirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];

/** The directories of bundled graphics, as repo-relative paths. `illustrations/thumbs/<set>` belongs to its set. */
export function bundledAssetDirs(root) {
  const pub = join(root, 'apps', 'studio', 'public');
  const dirs = [];
  for (const top of subdirs(pub)) {
    if (top !== 'illustrations') {
      dirs.push(`apps/studio/public/${top}`);
      continue;
    }
    const sets = subdirs(join(pub, top));
    for (const set of sets.filter((n) => n !== 'thumbs'))
      dirs.push(`apps/studio/public/${top}/${set}`);
    for (const thumbs of subdirs(join(pub, top, 'thumbs')))
      if (!sets.includes(thumbs)) dirs.push(`apps/studio/public/${top}/thumbs/${thumbs}`);
  }
  if (existsSync(join(root, SAMPLES_DIR))) dirs.push(SAMPLES_DIR);
  return dirs;
}

/** The sample photos for previews and goldens; their rows live in `samples.json` next to them. */
const SAMPLES_DIR = 'packages/templates-open/src/samples';

/** Problems of the sample-photo manifest: a row without file, a file without row, a licence outside ALLOWED. */
function checkSampleManifest(root) {
  const dir = join(root, SAMPLES_DIR);
  if (!existsSync(dir)) return [];
  const manifest = readJson(join(dir, 'samples.json'));
  if (!manifest || !Array.isArray(manifest.photos))
    return [
      { path: SAMPLES_DIR, message: `${SAMPLES_DIR}: samples.json is missing or has no "photos"` },
    ];
  const problems = [];
  const listed = new Set();
  for (const row of manifest.photos) {
    listed.add(row.file);
    if (!existsSync(join(dir, String(row.file))))
      problems.push({
        path: SAMPLES_DIR,
        message: `${SAMPLES_DIR}: ${row.file} has a row but no file`,
      });
    if (!ALLOWED.has(row.licence))
      problems.push({
        path: SAMPLES_DIR,
        message: `${SAMPLES_DIR}: ${row.file}: licence "${row.licence}" is not allowed`,
      });
    if (!row.source || !row.author)
      problems.push({
        path: SAMPLES_DIR,
        message: `${SAMPLES_DIR}: ${row.file}: source and author are required`,
      });
  }
  for (const f of readdirSync(dir).filter((n) => /\.(jpe?g|png|webp)$/i.test(n)))
    if (!listed.has(f))
      problems.push({
        path: SAMPLES_DIR,
        message: `${SAMPLES_DIR}: ${f} has no row in samples.json`,
      });
  return problems;
}

/** Problems of the bundled graphics against the notices file: a list of { path, message }. */
export function checkBundledAssets(root) {
  const dirs = bundledAssetDirs(root);
  if (dirs.length === 0) return [];
  const manifestProblems = checkSampleManifest(root);
  const notices = join(root, NOTICES_FILE);
  if (!existsSync(notices))
    return dirs.map((d) => ({ path: d, message: `${NOTICES_FILE} is missing` }));
  const rows = readFileSync(notices, 'utf8')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .map((line) => line.split('|').map((cell) => cell.trim()));
  const problems = [...manifestProblems];
  for (const dir of dirs) {
    if (FORBIDDEN_SETS.some((name) => dir.toLowerCase().includes(name)))
      problems.push({ path: dir, message: `${dir}: this set must never be bundled` });
    const row = rows.find((cells) => cells.some((cell) => cell.includes(`\`${dir}\``)));
    if (!row) {
      problems.push({ path: dir, message: `${dir}: no entry in ${NOTICES_FILE}` });
      continue;
    }
    const licenceCell = row[3] ?? '';
    const licenceId = licenceCell.match(/^[A-Za-z0-9.+-]+/)?.[0] ?? '';
    if (!ALLOWED.has(licenceId))
      problems.push({
        path: dir,
        message: `${dir}: licence "${licenceCell}" in ${NOTICES_FILE} is not allowed`,
      });
  }
  return problems;
}

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|css)$/;
const HEADER_LINES = 5;

/** Source files (relative paths) that carry no SPDX-License-Identifier in their first lines. */
export function missingSpdxHeaders(root, files) {
  return files
    .filter((file) => SOURCE_FILE.test(file))
    .filter((file) => {
      const head = readFileSync(join(root, file), 'utf8').split('\n', HEADER_LINES).join('\n');
      return !head.includes('SPDX-License-Identifier:');
    });
}

const SPDX_ID = /SPDX-License-Identifier:\s*([^\s*]+)/;

/**
 * Source files whose SPDX id differs from the licence their package declares (the nearest
 * package.json above the file). A file with no header is `missingSpdxHeaders`' business.
 * Returns `{ file, found, expected }`.
 */
export function mismatchedSpdxHeaders(root, files) {
  const licenceOf = new Map();
  const nearest = (file) => {
    let dir = dirname(file);
    for (;;) {
      if (!licenceOf.has(dir)) {
        const pkg = readJson(join(root, dir, 'package.json'));
        licenceOf.set(dir, pkg ? (declaredLicense(pkg) ?? null) : undefined);
      }
      const known = licenceOf.get(dir);
      if (known !== undefined) return known;
      if (dir === '.' || dir === '') return null;
      dir = dirname(dir);
    }
  };
  const out = [];
  for (const file of files.filter((f) => SOURCE_FILE.test(f))) {
    const head = readFileSync(join(root, file), 'utf8').split('\n', HEADER_LINES).join('\n');
    const found = SPDX_ID.exec(head)?.[1];
    const expected = nearest(file);
    if (found && expected && found !== expected) out.push({ file, found, expected });
  }
  return out;
}

/** Where tracked source files must carry an SPDX header naming their package's licence. */
const SPDX_ROOTS = ['apps', 'packages', 'examples'];

function trackedSources(root) {
  return execFileSync('git', ['ls-files', '-z', ...SPDX_ROOTS], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

function selfTest() {
  const base = mkdtempSync(join(tmpdir(), 'ggraphic-licenses-'));
  const failures = [];
  const write = (file, data) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  };
  const fixture = (name, deps) => {
    const root = join(base, name);
    write(join(root, 'package.json'), {
      name: 'root',
      version: '1.0.0',
      license: 'MPL-2.0',
      dependencies: Object.fromEntries(Object.keys(deps).map((d) => [d, '*'])),
    });
    for (const [dep, meta] of Object.entries(deps))
      write(join(root, 'node_modules', dep, 'package.json'), {
        name: dep,
        version: '1.0.0',
        ...meta,
      });
    return root;
  };
  const expect = (label, root, wantRed, needle) => {
    const { problems } = checkLicenses([root]);
    const red = problems.length > 0;
    if (red !== wantRed || (needle && !problems.some((p) => p.message.includes(needle))))
      failures.push(
        `${label}: expected ${wantRed ? 'red' : 'green'}, got ${JSON.stringify(problems)}`
      );
  };
  try {
    expect(
      'clean',
      fixture('clean', { a: { license: 'MIT' }, b: { license: '(MIT OR GPL-3.0)' } }),
      false
    );
    expect('gpl', fixture('gpl', { a: { license: 'GPL-3.0-only' } }), true, 'GPL-3.0-only');
    expect('and-gpl', fixture('and', { a: { license: 'MIT AND GPL-3.0' } }), true);
    expect('missing', fixture('missing', { a: {} }), true, 'no license');
    expect('see-license', fixture('see', { a: { license: 'SEE LICENSE IN LICENSE.md' } }), true);
    const transitive = fixture('transitive', { a: { license: 'MIT', dependencies: { c: '*' } } });
    write(join(transitive, 'node_modules', 'c', 'package.json'), {
      name: 'c',
      version: '1.0.0',
      license: 'AGPL-3.0',
    });
    expect('transitive', transitive, true, 'AGPL-3.0');
    const peer = fixture('peer', { a: { license: 'MIT', peerDependencies: { p: '*' } } });
    write(join(peer, 'node_modules', 'p', 'package.json'), {
      name: 'p',
      version: '1.0.0',
      license: 'GPL-2.0',
    });
    expect('peer', peer, true, 'GPL-2.0');
    const icons = fixture('icons-bad', { '@iconify-json/zz': { license: 'MIT' } });
    write(join(icons, 'node_modules', '@iconify-json', 'zz', 'info.json'), {
      license: { spdx: 'LicenseRef-Custom' },
    });
    expect('iconify-info-bad', icons, true, 'icon data');
    const good = fixture('icons-good', { '@iconify-json/zz': { license: 'MIT' } });
    write(join(good, 'node_modules', '@iconify-json', 'zz', 'info.json'), {
      license: { spdx: 'Apache-2.0' },
    });
    expect('iconify-info-good', good, false);

    const assetRoot = (name, notices, dirs) => {
      const root = join(base, name);
      for (const d of dirs) mkdirSync(join(root, d), { recursive: true });
      if (notices !== null) writeFileSync(join(root, NOTICES_FILE), notices);
      return root;
    };
    const row = (dir, licence) => `| \`${dir}\` | A work | ${licence} | https://example.org |\n`;
    const set = 'apps/studio/public/illustrations/zz';
    const expectAssets = (label, root, wantRed, needle) => {
      const problems = checkBundledAssets(root);
      if (
        problems.length > 0 !== wantRed ||
        (needle && !problems.some((p) => p.message.includes(needle)))
      )
        failures.push(
          `${label}: expected ${wantRed ? 'red' : 'green'}, got ${JSON.stringify(problems)}`
        );
    };
    expectAssets('asset-listed', assetRoot('a1', row(set, 'CC0-1.0'), [set]), false);
    expectAssets('asset-unlisted', assetRoot('a2', row('other', 'MIT'), [set]), true, 'no entry');
    expectAssets('asset-no-notices', assetRoot('a3', null, [set]), true, 'is missing');
    expectAssets(
      'asset-bad-licence',
      assetRoot('a4', row(set, 'CC-BY-NC-4.0'), [set]),
      true,
      'not allowed'
    );
    expectAssets(
      'asset-thumbs-orphan',
      assetRoot('a5', row(set, 'MIT'), [set, 'apps/studio/public/illustrations/thumbs/yy']),
      true,
      'thumbs/yy'
    );
    const undraw = 'apps/studio/public/illustrations/undraw';
    expectAssets('asset-undraw', assetRoot('a6', row(undraw, 'MIT'), [undraw]), true, 'never');

    const samples = 'packages/templates-open/src/samples';
    const sampleRoot = (name, manifest, files) => {
      const root = assetRoot(name, row(samples, 'CC0-1.0'), [samples]);
      writeFileSync(join(root, samples, 'samples.json'), JSON.stringify(manifest));
      for (const f of files) writeFileSync(join(root, samples, f), 'x');
      return root;
    };
    const photoRow = (file, licence) => ({ file, licence, source: 's', author: 'a' });
    expectAssets(
      'samples-ok',
      sampleRoot('a7', { photos: [photoRow('a.jpg', 'CC0-1.0')] }, ['a.jpg']),
      false
    );
    expectAssets(
      'samples-bad-licence',
      sampleRoot('a8', { photos: [photoRow('a.jpg', 'CC-BY-NC-4.0')] }, ['a.jpg']),
      true,
      'not allowed'
    );
    expectAssets(
      'samples-no-row',
      sampleRoot('a9', { photos: [] }, ['a.jpg']),
      true,
      'no row in samples.json'
    );
    expectAssets(
      'samples-no-file',
      sampleRoot('a10', { photos: [photoRow('a.jpg', 'CC0-1.0')] }, []),
      true,
      'no file'
    );

    const sources = join(base, 'sources');
    mkdirSync(sources, { recursive: true });
    writeFileSync(join(sources, 'ok.ts'), '// SPDX-License-Identifier: MPL-2.0\nexport {};\n');
    writeFileSync(join(sources, 'bare.ts'), 'export {};\n');
    writeFileSync(join(sources, 'notes.md'), 'no header needed\n');
    const bare = missingSpdxHeaders(sources, ['ok.ts', 'bare.ts', 'notes.md']);
    if (bare.length !== 1 || bare[0] !== 'bare.ts')
      failures.push(`spdx: expected only bare.ts, got ${JSON.stringify(bare)}`);
    // A header that names another licence than the package declares.
    const pkgDir = join(base, 'ids', 'packages', 'p');
    write(join(pkgDir, 'package.json'), { name: 'p', version: '1.0.0', license: 'MPL-2.0' });
    writeFileSync(join(pkgDir, 'right.ts'), '// SPDX-License-Identifier: MPL-2.0\nexport {};\n');
    writeFileSync(
      join(pkgDir, 'wrong.ts'),
      '// SPDX-License-Identifier: AGPL-3.0-only\nexport {};\n'
    );
    const wrong = mismatchedSpdxHeaders(join(base, 'ids'), [
      'packages/p/right.ts',
      'packages/p/wrong.ts',
    ]);
    if (wrong.length !== 1 || wrong[0].file !== 'packages/p/wrong.ts')
      failures.push(`spdx-id: expected only wrong.ts, got ${JSON.stringify(wrong)}`);
    // The examples are scanned too: a tracked file there without a header, or with another id.
    const repo = join(base, 'repo');
    const example = join(repo, 'examples', 'e');
    write(join(example, 'package.json'), { name: 'e', private: true, license: 'MPL-2.0' });
    writeFileSync(join(example, 'bare.ts'), 'export {};\n');
    writeFileSync(join(example, 'wrong.ts'), '// SPDX-License-Identifier: CC0-1.0\nexport {};\n');
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['add', '.'], { cwd: repo });
    const tracked = trackedSources(repo);
    const exampleBare = missingSpdxHeaders(repo, tracked);
    if (exampleBare.join() !== 'examples/e/bare.ts')
      failures.push(
        `spdx-examples: expected examples/e/bare.ts, got ${JSON.stringify(exampleBare)}`
      );
    const exampleWrong = mismatchedSpdxHeaders(repo, tracked).map((w) => w.file);
    if (exampleWrong.join() !== 'examples/e/wrong.ts')
      failures.push(
        `spdx-examples: expected examples/e/wrong.ts, got ${JSON.stringify(exampleWrong)}`
      );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return failures;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) {
    const failures = selfTest();
    if (failures.length > 0) {
      console.error('✖ ggraphic licence self-test failed:');
      for (const f of failures) console.error(`  · ${f}`);
      process.exit(1);
    }
    console.log('✓ ggraphic licence self-test: 19 probes ok');
  } else {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const assetProblems = checkBundledAssets(root);
    if (assetProblems.length > 0) {
      console.error(`\n✖ ${assetProblems.length} bundled asset problem(s):\n`);
      for (const p of assetProblems) console.error(`  ${p.message}`);
      process.exit(1);
    }
    const dirs = ROOT_PACKAGES.map((p) => join(root, 'packages', p));
    const missing = dirs.filter(
      (d) => !existsSync(join(d, 'node_modules')) && !existsSync(join(root, 'node_modules'))
    );
    if (missing.length > 0) {
      console.error('✖ node_modules missing — run pnpm install first');
      process.exit(1);
    }
    const { problems, count } = checkLicenses(dirs);
    if (problems.length > 0) {
      console.error(
        `\n✖ ${problems.length} licence problem(s) in the @ggraphic dependency tree:\n`
      );
      for (const p of problems) console.error(`  ${p.message}\n    via ${p.path}`);
      process.exit(1);
    }
    console.log(`✓ ${count} package(s) in the @ggraphic dependency tree have allowed licences`);
    const bare = missingSpdxHeaders(root, trackedSources(root));
    if (bare.length > 0) {
      console.error(
        `\n✖ ${bare.length} source file(s) without an SPDX-License-Identifier header:\n`
      );
      for (const file of bare) console.error(`  ${file}`);
      process.exit(1);
    }
    console.log('✓ every source file under apps/, packages/ and examples/ carries an SPDX header');
    const wrong = mismatchedSpdxHeaders(root, trackedSources(root));
    if (wrong.length > 0) {
      console.error(
        `\n✖ ${wrong.length} source file(s) whose SPDX id differs from their package's licence:\n`
      );
      for (const w of wrong)
        console.error(`  ${w.file}: ${w.found}, package declares ${w.expected}`);
      process.exit(1);
    }
    console.log("✓ every SPDX header names its package's licence");
  }
}
