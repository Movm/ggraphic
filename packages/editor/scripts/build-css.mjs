// SPDX-License-Identifier: AGPL-3.0-only
// Writes `dist/styles/compiled.css` (see compiled-css.mjs).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { compileEditorCss } from './compiled-css.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist/styles/compiled.css');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, await compileEditorCss(path.join(root, 'src')));
