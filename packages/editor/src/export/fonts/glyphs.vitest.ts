// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveFontFiles, type FontFile, type FontFileSet } from './fontFiles.js';
import { glyphOutline, loadFontkit, splitRuns } from './glyphs.js';

const fontsourceDir = path.dirname(
  createRequire(import.meta.url).resolve('@fontsource/instrument-sans/package.json')
);
const latinBytes = new Uint8Array(
  readFileSync(path.join(fontsourceDir, 'files', 'instrument-sans-latin-400-normal.woff2'))
);

const spec = { family: 'Instrument Sans', weight: 400, style: 'normal', size: 100 } as const;

async function latinOnly(): Promise<{ set: FontFileSet; latin: FontFile }> {
  const set = await resolveFontFiles(spec, {
    brandFaces: [{ family: spec.family, src: 'latin.woff2' }],
    fetchBytes: async () => latinBytes,
  });
  return { set, latin: set.files[0]! };
}

describe('loadFontkit', () => {
  it('imports fontkit on demand', async () => {
    const fontkit = await loadFontkit();
    expect(typeof fontkit.create).toBe('function');
  });
});

describe('splitRuns', () => {
  it('reports a missing glyph run and keeps it, with the xs split accordingly', async () => {
    const { set, latin } = await latinOnly();
    const runs = splitRuns(set, 'A→', [10, 30]);
    expect(runs).toEqual([
      { file: latin, text: 'A', xs: [10] },
      { file: null, text: '→', xs: [30] },
    ]);
  });

  it('merges neighbours that share a file and splits around the one that does not', async () => {
    const { set, latin } = await latinOnly();
    const runs = splitRuns(set, 'ab→→cd', [0, 1, 2, 3, 4, 5]);
    expect(runs).toEqual([
      { file: latin, text: 'ab', xs: [0, 1] },
      { file: null, text: '→→', xs: [2, 3] },
      { file: latin, text: 'cd', xs: [4, 5] },
    ]);
  });

  it('indexes xs by code point, not by UTF-16 unit', async () => {
    const { set, latin } = await latinOnly();
    const text = 'A😀B'; // 4 UTF-16 units, 3 code points
    const runs = splitRuns(set, text, [5, 15, 25]);
    expect(runs).toEqual([
      { file: latin, text: 'A', xs: [5] },
      { file: null, text: '😀', xs: [15] },
      { file: latin, text: 'B', xs: [25] },
    ]);
  });

  it('is one run for text a single file covers, and none for no text', async () => {
    const { set, latin } = await latinOnly();
    expect(splitRuns(set, 'Hallo', [0, 1, 2, 3, 4])).toEqual([
      { file: latin, text: 'Hallo', xs: [0, 1, 2, 3, 4] },
    ]);
    expect(splitRuns(set, '', [])).toEqual([]);
  });

  it('puts all text into one missing run for a face without files', async () => {
    const set = await resolveFontFiles(spec, { fetchBytes: async () => null });
    expect(splitRuns(set, 'Hi', [0, 7])).toEqual([{ file: null, text: 'Hi', xs: [0, 7] }]);
  });
});

describe('glyphOutline', () => {
  it("'H' at 100px has an advance of advanceWidth*100/unitsPerEm and a closed path", async () => {
    const { latin } = await latinOnly();
    const [h] = glyphOutline(latin, 'H', 100);
    const glyph = latin.font.glyphForCodePoint(0x48);
    expect(h!.advance).toBeCloseTo((glyph.advanceWidth * 100) / latin.font.unitsPerEm, 9);
    expect(h!.advance).toBeGreaterThan(0);

    const { path: commands } = h!;
    expect(commands[0]!.op).toBe('M');
    expect(commands.at(-1)).toEqual({ op: 'Z' });
    // Every subpath is closed: each M after the first follows a Z.
    commands.forEach((c, i) => {
      if (c.op === 'M' && i > 0) expect(commands[i - 1]!.op).toBe('Z');
    });
  });

  it('draws y down with the baseline at 0, scaled to the size', async () => {
    const { latin } = await latinOnly();
    const [h] = glyphOutline(latin, 'H', 100);
    const ys = h!.path.flatMap((c) => (c.op === 'Z' ? [] : [c.y]));
    // Instrument Sans draws the H 720 of 1000 units tall.
    expect(latin.font.unitsPerEm).toBe(1000);
    expect(Math.min(...ys)).toBeCloseTo(-72, 6);
    expect(Math.max(...ys)).toBeCloseTo(0, 6);
    // The same glyph at half the size is half as big.
    const [half] = glyphOutline(latin, 'H', 50);
    expect(half!.advance).toBeCloseTo(h!.advance / 2, 9);
    expect(Math.min(...half!.path.flatMap((c) => (c.op === 'Z' ? [] : [c.y])))).toBeCloseTo(
      Math.min(...ys) / 2,
      6
    );
  });

  it('shears a slanted file about the baseline: the top moves right by slant × height, the advance stays', async () => {
    const { latin } = await latinOnly();
    const slanted: FontFile = { ...latin, slant: 0.25 };
    const [upright] = glyphOutline(latin, 'H', 100);
    const [leaning] = glyphOutline(slanted, 'H', 100);
    expect(leaning!.advance).toBe(upright!.advance);
    expect(leaning!.path).toHaveLength(upright!.path.length);
    upright!.path.forEach((c, i) => {
      const moved = leaning!.path[i]!;
      if (c.op === 'Z') return expect(moved).toEqual(c);
      // y is up-negative: a point 72 px above the baseline (y = -72) shifts 18 px to the right.
      expect(moved).toMatchObject({ op: c.op, y: c.y });
      expect((moved as { x: number }).x).toBeCloseTo((c as { x: number }).x - 0.25 * c.y, 9);
    });
    const heights = upright!.path.flatMap((c) => (c.op === 'Z' ? [] : [c.y]));
    const top = upright!.path.findIndex((c) => c.op !== 'Z' && c.y === Math.min(...heights));
    expect((leaning!.path[top] as { x: number }).x).toBeCloseTo(
      (upright!.path[top] as { x: number }).x + 18,
      6
    );
  });

  it('gives one entry per code point, with curves for round letters and nothing for a space', async () => {
    const { latin } = await latinOnly();
    const out = glyphOutline(latin, 'o é', 100);
    expect(out).toHaveLength(3);
    const ops = new Set(out[0]!.path.map((c) => c.op));
    expect(ops.has('Q') || ops.has('C')).toBe(true);
    expect(out[1]!.path).toEqual([]);
    expect(out[1]!.advance).toBeGreaterThan(0);
    expect(out[2]!.path.length).toBeGreaterThan(0);
    expect(glyphOutline(latin, '😀A', 10)).toHaveLength(2);
  });

  it('writes no negative zero, so the output stays byte-stable', async () => {
    const { latin } = await latinOnly();
    const numbers = [latin, { ...latin, slant: 0.25 }]
      .flatMap((file) => glyphOutline(file, 'Hxz', 37))
      .flatMap((g) =>
        g.path.flatMap((c) => Object.values(c).filter((v): v is number => typeof v === 'number'))
      );
    expect(numbers.some((n) => Object.is(n, -0))).toBe(false);
  });
});
