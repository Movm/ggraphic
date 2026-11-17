// SPDX-License-Identifier: MIT
/**
 * Packs the built @ggraphic packages into ./tarballs under version-free names, so package.json
 * can point at them. Run `pnpm build` in the repository root first: `pnpm pack` takes `dist` as
 * it is and rewrites `workspace:*` to the exact versions.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PACKAGES = ['schema', 'core', 'brand-default', 'editor'];

const root = fileURLToPath(new URL('../../../', import.meta.url));
const out = fileURLToPath(new URL('../tarballs/', import.meta.url));
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
// The lockfiles of an earlier install pin the old tarballs' integrity, and npm would keep them.
for (const lock of ['../package-lock.json', '../node_modules/.package-lock.json'])
  rmSync(fileURLToPath(new URL(lock, import.meta.url)), { force: true });

for (const name of PACKAGES) {
  execFileSync('pnpm', ['pack', '--pack-destination', out], {
    cwd: `${root}packages/${name}`,
    stdio: 'inherit',
  });
  const [file] = readdirSync(out).filter((f) => f.startsWith(`ggraphic-${name}-`));
  renameSync(`${out}${file}`, `${out}ggraphic-${name}.tgz`);
}
