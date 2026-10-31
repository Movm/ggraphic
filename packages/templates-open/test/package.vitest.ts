// SPDX-License-Identifier: CC0-1.0
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import samples from '../src/samples/samples.json' with { type: 'json' };

const PKG = join(import.meta.dirname, '..');

describe('the published package', () => {
  // The sample photos are loaded with `new URL('./<file>', import.meta.url)`, so the built
  // `dist/samples/index.js` needs each file next to it; tsc copies only code and JSON.
  it('ships every sample photo next to the built index', () => {
    execFileSync('pnpm', ['run', 'build'], { cwd: PKG, stdio: 'ignore' });
    const [pack] = JSON.parse(
      execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: PKG, encoding: 'utf8' })
    ) as { files: { path: string }[] }[];
    const shipped = new Set(pack!.files.map((f) => f.path));
    for (const row of samples.photos) expect(shipped).toContain(`dist/samples/${row.file}`);
    expect(shipped).toContain('dist/samples/index.js');
  }, 120_000);
});
