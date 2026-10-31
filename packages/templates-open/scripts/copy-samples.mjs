// SPDX-License-Identifier: CC0-1.0
// tsc emits code and JSON only; the sample photos are loaded with `new URL('./<file>',
// import.meta.url)` and must sit next to the built `dist/samples/index.js`.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';

const from = new URL('../src/samples/', import.meta.url);
const to = new URL('../dist/samples/', import.meta.url);
mkdirSync(to, { recursive: true });
for (const file of readdirSync(from))
  if (file.endsWith('.jpg')) copyFileSync(new URL(file, from), new URL(file, to));
