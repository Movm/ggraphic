// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadFontkit } from '../fonts/glyphs.js';
import { encodeSimpleGlyph, fontkitForPdf } from './pdfFontkit.js';

const dir = path.dirname(
  createRequire(import.meta.url).resolve('@fontsource/instrument-sans/package.json')
);
const woff2 = new Uint8Array(
  readFileSync(path.join(dir, 'files', 'instrument-sans-latin-400-normal.woff2'))
);

interface Glyph {
  id: number;
  advanceWidth: number;
  bbox: unknown;
  path: { commands: { command: string; args: number[] }[] };
}
interface Font {
  numGlyphs: number;
  characterSet: number[];
  glyphForCodePoint(cp: number): Glyph;
  getGlyph(id: number): Glyph;
  createSubset(): {
    includeGlyph(glyph: Glyph): number;
    encodeStream(): NodeJS.EventEmitter;
  };
}

const contours = (glyph: Glyph) => glyph.path.commands.filter((c) => c.command === 'moveTo').length;

describe('the subset of a WOFF2 face', () => {
  it('holds every glyph with the outline and the advance it has in the face', async () => {
    const fontkit = await loadFontkit();
    const face = fontkitForPdf(fontkit).create(woff2) as unknown as Font;
    const subset = face.createSubset();
    const made = new Map<number, Glyph>();
    const ids = new Map<number, number>();
    for (const codePoint of face.characterSet) {
      const glyph = face.glyphForCodePoint(codePoint);
      made.set(glyph.id, glyph);
      ids.set(glyph.id, subset.includeGlyph(glyph));
    }
    const parts: Buffer[] = [];
    await new Promise<void>((resolve) => {
      const stream = subset.encodeStream();
      stream.on('data', (part: Buffer) => parts.push(part));
      stream.on('end', () => resolve());
    });
    // A TrueType font program, read by fontkit as such (not as WOFF2: there is no `glyf` stored
    // transformed in it).
    const program = new Uint8Array(Buffer.concat(parts));
    const back = fontkit.create(program) as unknown as Font;

    expect(ids.size).toBeGreaterThan(200);
    let withOutline = 0;
    for (const [original, index] of ids) {
      const wanted = made.get(original)!;
      const got = back.getGlyph(index);
      expect(got.advanceWidth, `advance of glyph ${original}`).toBe(wanted.advanceWidth);
      expect(got.bbox, `box of glyph ${original}`).toEqual(wanted.bbox);
      expect(contours(got), `contours of glyph ${original}`).toBe(contours(wanted));
      if (contours(wanted) > 0) withOutline++;
    }
    expect(withOutline).toBeGreaterThan(150);
  });

  it('writes the flags of a run of equal points with the count that follows them', () => {
    // Four points one step on from the last: their flags are equal and come last. A record that
    // leaves out the count of that trailing run is short by one byte, which is what fontkit's own
    // encoder does.
    const diagonal = [
      { command: 'moveTo' as const, args: [0, 0] },
      ...[10, 20, 30, 40].map((at) => ({ command: 'lineTo' as const, args: [at, at] })),
    ];
    const { bytes, xMin } = encodeSimpleGlyph(diagonal);
    expect(xMin).toBe(0);
    expect(bytes.length % 4).toBe(0);
    expect([...bytes]).toEqual([
      ...[0, 1, 0, 0, 0, 0, 0, 40, 0, 40], // one contour, the box
      ...[0, 4], // its last point
      ...[0, 0], // no instructions
      ...[0x01 | 0x10 | 0x20, 0x01 | 0x02 | 0x04 | 0x10 | 0x20 | 0x08, 3], // first; then four equal, three repeats
      ...[10, 10, 10, 10], // x steps
      ...[10, 10, 10, 10], // y steps
      ...[0, 0, 0], // to a multiple of four
    ]);
  });

  it('says so when an outline is cubic', () => {
    expect(() =>
      encodeSimpleGlyph([
        { command: 'moveTo', args: [0, 0] },
        { command: 'bezierCurveTo', args: [1, 1, 2, 2, 3, 3] },
      ])
    ).toThrow(/cubic/);
  });

  it('leaves a font that is not WOFF2 to fontkit', async () => {
    const fontkit = await loadFontkit();
    const ttf = new Uint8Array(
      readFileSync(
        path.join(
          path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),
          'standard_fonts',
          'LiberationSans-Regular.ttf'
        )
      )
    );
    const font = fontkitForPdf(fontkit).create(ttf) as unknown as Font;
    const original = fontkit.create(ttf) as unknown as Font;
    expect(font.createSubset.toString()).toBe(original.createSubset.toString());
  });
});
