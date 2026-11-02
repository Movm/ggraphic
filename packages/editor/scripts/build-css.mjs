// SPDX-License-Identifier: MPL-2.0
// Writes `dist/styles/compiled.css` (see compiled-css.mjs) and the stylesheets' type stub, which
// the `cpSync` of the build skips like every `.ts` file.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { compileEditorCss } from './compiled-css.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist/styles/compiled.css');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, await compileEditorCss(path.join(root, 'src')));
copyFileSync(
  path.join(root, 'src/styles/stylesheet.d.ts'),
  path.join(root, 'dist/styles/stylesheet.d.ts')
);
