// SPDX-License-Identifier: CC0-1.0
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import samples from '../src/samples/samples.json' with { type: 'json' };
import { SAMPLE_PHOTOS } from '../src/index.js';

const DIR = join(import.meta.dirname, '../src/samples');
const files = readdirSync(DIR).filter((f) => f.endsWith('.jpg'));

describe('sample photos manifest', () => {
  it('has a row for every file, and a file for every row', () => {
    expect(samples.photos.map((r) => r.file).sort()).toEqual([...files].sort());
  });

  it('licenses every row CC0-1.0 with source and author', () => {
    for (const row of samples.photos) {
      expect(row.licence).toBe('CC0-1.0');
      expect(row.source).not.toBe('');
      expect(row.author).not.toBe('');
    }
  });

  it('keeps each file at 250 KB or less', () => {
    for (const f of files) expect(statSync(join(DIR, f)).size).toBeLessThanOrEqual(250 * 1024);
  });

  it('exposes every row with a loadable src and a known role', () => {
    expect(SAMPLE_PHOTOS).toHaveLength(samples.photos.length);
    for (const p of SAMPLE_PHOTOS) {
      expect(p.src).toMatch(/\.jpg$/);
      expect(['portrait', 'scene', 'detail', 'crowd']).toContain(p.role);
    }
  });
});
