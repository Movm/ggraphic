// SPDX-License-Identifier: MPL-2.0
/**
 * Packs the built @ggraphic packages with the Vite example's script (importing it runs it) and
 * copies its tarballs here, so both examples install the same files. Run `pnpm build` in the
 * repository root first.
 */
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import '../../vite-react/scripts/pack.mjs';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

rmSync(here('../tarballs'), { recursive: true, force: true });
cpSync(here('../../vite-react/tarballs'), here('../tarballs'), { recursive: true });
// The lockfiles of an earlier install pin the old tarballs' integrity, and npm would keep them.
for (const lock of ['../package-lock.json', '../node_modules/.package-lock.json'])
  rmSync(here(lock), { force: true });
