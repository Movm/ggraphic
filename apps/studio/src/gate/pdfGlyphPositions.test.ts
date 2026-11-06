// SPDX-License-Identifier: AGPL-3.0-only
// The PDF writer's text positions, with a font the editor package does not ship: Fraunces Italic,
// whose 'w', 'h' and 'l' are drawn with another glyph than the cmap names (`rvrn`). It lives here
// because the Studio is where the fonts of the default brand are.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  emptyReport,
  resolveFontFiles,
  writePdf,
  writeSvg,
  type ExportScene,
  type FontFileSet,
  type FontSpec,
} from '@ggraphic/editor/export';
import { beforeAll, describe, expect, it } from 'vitest';

const FACE: FontSpec = { family: 'Fraunces', weight: 400, style: 'italic', size: 61 };
const KEY = 'Fraunces|400|italic';
// 'w', 'h' and 'l' are the letters Fraunces shapes differently; no pair of this text is a ligature.
const TEXT = 'town hall but at every kitchen';
const X0 = 20;
const Y = 100;

const fontsourceDir = path.dirname(
  createRequire(import.meta.url).resolve('@fontsource/fraunces/package.json')
);

let set: FontFileSet;
let xs: number[];

/** The x of every code point as a browser measures it: the shaped advances, kerning included. */
function measure(file: FontFileSet['files'][number]): number[] {
  const { glyphs, positions } = file.font.layout(TEXT) as unknown as {
    glyphs: unknown[];
    positions: { xAdvance: number }[];
  };
  expect(glyphs).toHaveLength(Array.from(TEXT).length); // no ligature: one glyph per code point
  let x = X0;
  return positions.map((position) => {
    const at = x;
    x += (position.xAdvance * FACE.size) / file.font.unitsPerEm;
    return at;
  });
}

const sceneOf = (text: string, positions: number[]): ExportScene => ({
  width: 800,
  height: 200,
  report: emptyReport(),
  items: [
    {
      elementId: 't',
      label: null,
      ops: [
        {
          kind: 'text',
          matrix: [1, 0, 0, 1, 0, 0],
          alpha: 1,
          clips: [],
          shadow: null,
          mode: 'fill',
          text,
          xs: positions,
          y: Y,
          font: FACE,
          paint: { type: 'solid', hex: '#000000', alpha: 1 },
          stroke: null,
        },
      ],
    },
  ],
});

beforeAll(async () => {
  const bytes = new Uint8Array(
    readFileSync(path.join(fontsourceDir, 'files', 'fraunces-latin-400-italic.woff2'))
  );
  set = await resolveFontFiles(FACE, {
    brandFaces: [{ family: FACE.family, src: 'fraunces.woff2', style: 'italic' }],
    fetchBytes: async () => bytes,
  });
  xs = measure(set.files[0]!);
});

describe('text drawn in a font that shapes a letter to another glyph', () => {
  it('the font does what the test is about: the shaped glyph of w is not the cmap glyph', () => {
    const { font } = set.files[0]!;
    const cmap = font.glyphForCodePoint('w'.codePointAt(0)!);
    const shaped = font.layout('w').glyphs[0]!;
    expect(shaped.advanceWidth).not.toBe(cmap.advanceWidth);
  });

  it('puts every glyph of the PDF where the browser measured it, within half a pixel', async () => {
    const { bytes } = await writePdf([sceneOf(TEXT, xs)], {
      mode: 'digital',
      fonts: new Map([[KEY, set]]),
      rasterize: async () => null,
      rasterPixelRatio: 1,
    });

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false })
      .promise;
    const operators = await (await doc.getPage(1)).getOperatorList();

    // The text matrix sets the pen at x0; each glyph then moves it by its width in `/W` (1/1000
    // em), and a number in the array by minus that number: the model of the PDF specification.
    type Shown = number | { unicode: string; width: number };
    const shown: { x: number; unicode: string }[] = [];
    operators.fnArray.forEach((fn, index) => {
      if (fn !== pdfjs.OPS.showText) return;
      let pen = X0;
      for (const entry of operators.argsArray[index][0] as Shown[]) {
        if (typeof entry === 'number') pen -= (entry * FACE.size) / 1000;
        else {
          shown.push({ x: pen, unicode: entry.unicode });
          pen += (entry.width * FACE.size) / 1000;
        }
      }
    });

    expect(shown.map((glyph) => glyph.unicode).join('')).toBe(TEXT);
    const off = shown.map((glyph, i) => ({ char: glyph.unicode, error: glyph.x - xs[i]! }));
    expect(off.filter(({ error }) => Math.abs(error) > 0.5)).toEqual([]);
  });

  it('draws the outlines of the glyph the font shapes, not of the one the cmap names', () => {
    const { font } = set.files[0]!;
    const svg = writeSvg(sceneOf('w', [X0]), {
      text: 'outlines',
      fonts: new Map([[KEY, set]]),
      page: 1,
      report: emptyReport(),
    });
    // How far the outline reaches in x, in px: the two glyphs of 'w' differ by more than a pixel.
    const reach = (numbers: number[]) => Math.max(...numbers) - Math.min(...numbers);
    const written = reach(
      Array.from(/<path d="([^"]+)"/.exec(svg)![1]!.matchAll(/-?\d+(?:\.\d+)?/g), (m) =>
        Number(m[0])
      ).filter((_, i) => i % 2 === 0)
    );
    const glyphReach = (glyph: ReturnType<typeof font.layout>['glyphs'][number]) =>
      (reach(glyph.path.commands.flatMap((c) => c.args.filter((_, i) => i % 2 === 0))) *
        FACE.size) /
      font.unitsPerEm;
    const cmap = glyphReach(font.glyphForCodePoint('w'.codePointAt(0)!));
    const shaped = glyphReach(font.layout('w').glyphs[0]!);
    expect(Math.abs(shaped - cmap)).toBeGreaterThan(0.5);
    expect(written).toBeCloseTo(shaped, 1);
  });
});
