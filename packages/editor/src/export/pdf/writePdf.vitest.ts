// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The pragma above gives this one file the DOM `svgToScene` parses with; the lane is `node`.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createCanvas } from '@napi-rs/canvas';
import { PDFName } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { resolveFontFiles, type FontFile, type FontFileSet } from '../fonts/fontFiles.js';
import { loadFontkit } from '../fonts/glyphs.js';
import {
  base,
  bitmap,
  fill,
  fixtureScene,
  FIXTURE_FACE,
  item,
  rect,
  sceneOf,
  solid,
  svgImage,
  textOp,
} from '../scene/__fixtures__/exportSceneFixture.js';
import { cropMarkLines, pdfPageGeometry } from '../printPdf.js';
import { IDENTITY } from '../scene/matrix.js';
import { SLIDE_PDF_PAGE_PT } from '../slidesPdf.js';
import { emptyReport } from '../scene/types.js';
import { extractText, inspectPdf, renderPage, streamText } from './__fixtures__/inspectPdf.js';
import { napiRasterize } from './__fixtures__/napiRasterize.js';
import { num } from './pdfGeometry.js';
import { writePdf, type WritePdfOptions } from './writePdf.js';

import type {
  ClipPath,
  ColorStop,
  ExportScene,
  Matrix,
  Paint,
  PathCommand,
  SceneImageSource,
  SceneOp,
} from '../scene/types.js';

// ---------------------------------------------------------------------------------------------
// Fixtures: the real Instrument Sans (latin subset) and small real pictures.

const fontsourceDir = path.dirname(
  createRequire(import.meta.url).resolve('@fontsource/instrument-sans/package.json')
);
const latinBytes = new Uint8Array(
  readFileSync(path.join(fontsourceDir, 'files', 'instrument-sans-latin-400-normal.woff2'))
);

const FACE = FIXTURE_FACE;
const FACE_KEY = 'Instrument Sans|400|normal';
let set: FontFileSet;
let fonts: ReadonlyMap<string, FontFileSet>;
let png: Uint8Array;
let jpeg: Uint8Array;

beforeAll(async () => {
  set = await resolveFontFiles(FACE, {
    brandFaces: [{ family: FACE.family, src: 'latin.woff2' }],
    fetchBytes: async () => latinBytes,
  });
  fonts = new Map([[FACE_KEY, set]]);
  const canvas = createCanvas(4, 4);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#336699';
  ctx.fillRect(0, 0, 4, 4);
  ctx.fillStyle = '#cc3300';
  ctx.fillRect(0, 0, 2, 2);
  png = new Uint8Array(await canvas.encode('png'));
  jpeg = new Uint8Array(await canvas.encode('jpeg', 90));
});

/** Where each code point of `text` starts when the font's own advances are used, as a browser does. */
function xsOf(text: string, x0 = 20, size = FACE.size): number[] {
  const file = set.files[0]!;
  let x = x0;
  return Array.from(text, (char) => {
    const here = x;
    x +=
      (file.font.glyphForCodePoint(char.codePointAt(0)!).advanceWidth * size) /
      file.font.unitsPerEm;
    return here;
  });
}

const text = (value: string, over: Partial<Extract<SceneOp, { kind: 'text' }>> = {}) =>
  textOp(value, { xs: xsOf(value), ...over });

/** The face with another licence flag: the writer decides by `embeddable` and `OS/2.fsType`. */
function withFile(change: (file: FontFile) => FontFile): ReadonlyMap<string, FontFileSet> {
  const files = set.files.map(change);
  return new Map([
    [
      FACE_KEY,
      { face: set.face, files, fileFor: (cp: number) => (set.fileFor(cp) ? files[0]! : null) },
    ],
  ]);
}

async function write(
  pages: ExportScene | ExportScene[],
  over: Partial<WritePdfOptions> = {},
  raster = napiRasterize()
) {
  const result = await writePdf(Array.isArray(pages) ? pages : [pages], {
    mode: 'digital',
    fonts,
    rasterize: raster.rasterize,
    rasterPixelRatio: 2,
    ...over,
  });
  return { ...result, calls: raster.calls, pdf: await inspectPdf(result.bytes) };
}

/** The part of a fontkit font the tests read back out of an embedded program. */
interface EmbeddedFont {
  numGlyphs: number;
  glyphForCodePoint(cp: number): ReturnType<EmbeddedFont['getGlyph']>;
  getGlyph(id: number): {
    advanceWidth: number;
    bbox: unknown;
    path: { commands: readonly unknown[] };
  };
}

const only = <T>(list: T[]): T => {
  expect(list).toHaveLength(1);
  return list[0]!;
};

const squareAt = (x: number, y: number, size = 40): PathCommand[] => rect(x, y, size, size);

// ---------------------------------------------------------------------------------------------

describe('pages', () => {
  it('page size equals scene px in pt', async () => {
    const small: ExportScene = {
      ...sceneOf(item('a', null, fill(rect(0, 0, 5, 5), solid('#000000')))),
    };
    const large: ExportScene = { ...small, width: 1080, height: 1350.5 };
    const { pdf } = await write([small, large]);
    expect(pdf.doc.getPageCount()).toBe(2);
    expect(pdf.doc.getPage(0).getSize()).toEqual({ width: 400, height: 300 });
    expect(pdf.doc.getPage(1).getSize()).toEqual({ width: 1080, height: 1350.5 });
  });

  it('flips y once at the start of the page', async () => {
    const { pdf } = await write(sceneOf(item('a', null, fill(rect(0, 0, 5, 5), solid('#000000')))));
    const content = pdf.content(0);
    expect(content.startsWith('1 0 0 -1 0 300 cm\n')).toBe(true);
    expect(content.match(/ -1 0 \d+ cm/g)).toHaveLength(1);
  });

  it('needs the print format for the print mode, and says so', async () => {
    await expect(write(sceneOf(), { mode: 'print' })).rejects.toThrow(/print mode needs/);
  });

  it('leaves the scenes alone and returns their report together with its own', async () => {
    const scene = sceneOf(item('t', null, text('A→B')));
    scene.report.unknownCalls.push({ page: 1, elementId: 't', call: 'filter' });
    const { report } = await write(scene);
    expect(scene.report.missingGlyphs).toEqual([]);
    expect(report.unknownCalls).toEqual([{ page: 1, elementId: 't', call: 'filter' }]);
    expect(report.missingGlyphs).toEqual([{ page: 1, elementId: 't', text: '→' }]);
  });

  it('sets the title', async () => {
    const { pdf } = await write(sceneOf(), { title: 'Plakat' });
    expect(pdf.doc.getTitle()).toBe('Plakat');
  });
});

// ---------------------------------------------------------------------------------------------

describe('text', () => {
  it('text is real and extractable', async () => {
    const scene = sceneOf(
      item('a', null, text('Hallo Welt')),
      item('b', null, text('Zweite Zeile', { y: 160 }))
    );
    const { bytes, pdf } = await write(scene);
    expect((await extractText(bytes)).join('')).toBe('Hallo WeltZweite Zeile');
    expect(pdf.ofType('Image')).toHaveLength(0);
  });

  it('a soft hyphen the canvas does not draw neither advances the pen nor writes a glyph', async () => {
    // Most fonts map U+00AD to a hyphen glyph; this one's latin subset does not, so give it one.
    const real = set.files[0]!.font;
    const hyphen = real.glyphForCodePoint(0x2d);
    const font = Object.create(real) as typeof real;
    font.hasGlyphForCodePoint = (cp) => cp === 0xad || real.hasGlyphForCodePoint(cp);
    font.glyphForCodePoint = (cp) => (cp === 0xad ? hyphen : real.glyphForCodePoint(cp));
    font.layout = (value) => (value === '\u00ad' ? { glyphs: [hyphen] } : real.layout(value));
    const file = { ...set.files[0]!, font };
    const withHyphen = new Map([
      [FACE_KEY, { face: set.face, files: [file], fileFor: () => file }],
    ]);
    // As measured in a browser: the soft hyphen is 0 wide, the next letter starts where it does.
    const xs = xsOf('Worttrennung');
    xs.splice(4, 0, xs[4]!);

    const { bytes, pdf } = await write(
      sceneOf(item('a', null, textOp('Wort\u00adtrennung', { xs }))),
      { fonts: withHyphen }
    );

    expect((await extractText(bytes)).join('')).toBe('Worttrennung');
    // 12 glyphs of "Worttrennung", 4 hex digits each: no thirteenth for the hyphen.
    const hex = [...pdf.content(0).matchAll(/<([0-9a-f]+)>/g)].map((m) => m[1]).join('');
    expect(hex.length / 4).toBe(12);
    // And no shift to undo an advance: the letters follow each other.
    expect(pdf.content(0)).not.toMatch(/\] TJ[\s\S]*\] TJ/);
  });

  it('fonts are embedded as subsets', async () => {
    const { pdf } = await write(sceneOf(item('a', null, text('Hallo Welt'))));
    const descriptors = pdf.ofType('FontDescriptor');
    expect(descriptors.length).toBeGreaterThan(0);
    for (const { dict } of descriptors) {
      expect(pdf.name(dict, 'FontName')).toMatch(/^[A-Z]{6}\+InstrumentSans-Regular$/);
    }
    const program = pdf.bytesAt(descriptors[0]!.dict, 'FontFile2')!;
    // The glyphs of the text, not the whole face.
    expect(program.length).toBeLessThan(8_000);
    expect(pdf.ofType('Type0')).toHaveLength(1);
  });

  it('the embedded glyphs have their outlines (a WOFF2 source is not copied byte by byte)', async () => {
    // '"' and ':' are composite glyphs in this face: fontkit's own subset of it never finishes.
    const { pdf } = await write(sceneOf(item('a', null, text('H":Ä'))));
    const program = pdf.bytesAt(pdf.ofType('FontDescriptor')[0]!.dict, 'FontFile2')!;
    const embedded = (await loadFontkit()).create(program) as unknown as EmbeddedFont;
    const original = set.files[0]!.font as unknown as EmbeddedFont;
    // Glyph 0 is .notdef; the glyphs of the text follow in the order they were first used.
    const chars = Array.from('H":Ä');
    chars.forEach((char, index) => {
      const made = embedded.getGlyph(index + 1);
      const first = original.glyphForCodePoint(char.codePointAt(0)!);
      expect(made.path.commands.length, char).toBeGreaterThan(0);
      expect(made.bbox, char).toEqual(first.bbox);
      expect(made.advanceWidth, char).toBe(first.advanceWidth);
    });
  });

  it('puts every glyph at the x the browser measured', async () => {
    // The 'I' at 10 is followed by one at 200: far from where its advance would put it.
    const op = text('II', { xs: [10, 200] });
    const { pdf } = await write(sceneOf(item('a', null, op)));
    const file = set.files[0]!;
    const advance = (file.font.glyphForCodePoint(73).advanceWidth * 40) / file.font.unitsPerEm;
    const shift = Number((((10 + advance - 200) * 1000) / 40).toFixed(2));
    const content = pdf.content(0);
    expect(content).toContain('1 0 0 -1 10 100 Tm');
    expect(content).toMatch(new RegExp(`\\[<[0-9a-f]{4}> ${shift} <[0-9a-f]{4}>\\] TJ`));
  });

  it('shears the text matrix of an upright cut that stands in for an italic, and only that', async () => {
    const slanted = withFile((file) => ({ ...file, slant: 0.25 }));
    const op = text('II', { xs: [10, 200] });
    const { pdf } = await write(sceneOf(item('a', null, op)), { fonts: slanted });
    // The `c` term of the text matrix moves the top of a glyph (text space, y up) to the right.
    expect(pdf.content(0)).toContain('1 0 0.25 -1 10 100 Tm');
    const { pdf: upright } = await write(sceneOf(item('a', null, op)));
    expect(upright.content(0)).toContain('1 0 0 -1 10 100 Tm');
  });

  it('sets the pen by the advance of the glyph the font shapes, which is the width the PDF holds', async () => {
    // A font that shapes 'I' to a glyph 100 units (of 1000) wider: the next 'I' is 4 px (at 40 px)
    // closer than the pen says, and the array says so by 100 thousandths of an em.
    const real = set.files[0]!.font;
    const wider = withFile((file) => ({
      ...file,
      font: Object.create(real, {
        layout: {
          value: (value: string) => {
            const { glyphs } = real.layout(value);
            return {
              glyphs: glyphs.map((glyph) =>
                Object.create(glyph, { advanceWidth: { value: glyph.advanceWidth + 100 } })
              ),
            };
          },
        },
      }),
    }));
    const advance = (real.glyphForCodePoint(73).advanceWidth * 40) / real.unitsPerEm;
    const op = text('II', { xs: [10, 10 + advance] });
    const { pdf } = await write(sceneOf(item('a', null, op)), { fonts: wider });
    expect(pdf.content(0)).toMatch(/\[<[0-9a-f]{4}> 100 <[0-9a-f]{4}>\] TJ/);
    const { pdf: plain } = await write(sceneOf(item('a', null, op)));
    expect(plain.content(0)).toMatch(/\[<[0-9a-f]{8}>\] TJ/);
  });

  it('sets no adjustment where the advances already agree with the positions', async () => {
    const { pdf } = await write(sceneOf(item('a', null, text('Hallo'))));
    expect(pdf.content(0)).toMatch(/\[<[0-9a-f]{20}>\] TJ/);
  });

  it('strokes text with the stroke state', async () => {
    const op = text('Hi', {
      mode: 'stroke',
      stroke: { width: 1.5, cap: 'butt', join: 'round', miterLimit: 10, dash: [], dashOffset: 0 },
      paint: solid('#ff0000'),
    });
    const { pdf } = await write(sceneOf(item('a', null, op)));
    const content = pdf.content(0);
    expect(content).toContain('1 0 0 RG');
    expect(content).toContain('1.5 w');
    expect(content).toContain('1 Tr');
    expect(content).not.toContain(' rg');
  });

  it('keeps a font that forbids subsetting whole and under its own name', async () => {
    const noSubsetting = { 'OS/2': { value: { fsType: { noSubsetting: true } } } };
    const whole = withFile((file) => ({ ...file, font: Object.create(file.font, noSubsetting) }));
    const { pdf } = await write(sceneOf(item('a', null, text('Hi'))), { fonts: whole });
    const names = pdf.ofType('FontDescriptor').map(({ dict }) => pdf.name(dict, 'FontName'));
    expect(names).toEqual(['InstrumentSans-Regular']);
    // A WOFF2 file is no font program for a PDF: what is embedded is a TrueType font that has
    // every glyph of the face, not the two of the text and not the WOFF2 bytes.
    const program = pdf.bytesAt(pdf.ofType('FontDescriptor')[0]!.dict, 'FontFile2')!;
    const embedded = (await loadFontkit()).create(program) as unknown as EmbeddedFont;
    expect(embedded.numGlyphs).toBeGreaterThan(set.files[0]!.font.characterSet.length * 0.9);
    let drawn = 0;
    for (let id = 0; id < embedded.numGlyphs; id++) {
      if (embedded.getGlyph(id).path.commands.length > 0) drawn++;
    }
    expect(drawn).toBeGreaterThan(embedded.numGlyphs * 0.9);
  });

  describe('a TrueType file', () => {
    let ttf: FontFile;
    beforeAll(async () => {
      const bytes = new Uint8Array(
        readFileSync(
          path.join(
            path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),
            'standard_fonts',
            'LiberationSans-Regular.ttf'
          )
        )
      );
      ttf = {
        bytes,
        font: (await loadFontkit()).create(bytes) as unknown as FontFile['font'],
        embeddable: 'yes',
        ranges: null,
        slant: 0,
      };
    });

    it('is cut into a subset by fontkit, outlines and all', async () => {
      const { pdf } = await write(sceneOf(item('a', null, text('Hi'))), {
        fonts: withFile(() => ttf),
      });
      const [descriptor] = pdf.ofType('FontDescriptor');
      expect(pdf.name(descriptor!.dict, 'FontName')).toMatch(/^[A-Z]{6}\+LiberationSans$/);
      const program = pdf.bytesAt(descriptor!.dict, 'FontFile2')!;
      expect(program.length).toBeLessThan(5_000);
      const embedded = (await loadFontkit()).create(program) as unknown as EmbeddedFont;
      expect(embedded.getGlyph(1).path.commands.length).toBeGreaterThan(0);
    });

    it('is embedded as it is when its licence forbids subsetting', async () => {
      const noSubsetting = { 'OS/2': { value: { fsType: { noSubsetting: true } } } };
      const fonts = withFile(() => ({ ...ttf, font: Object.create(ttf.font, noSubsetting) }));
      const { pdf } = await write(sceneOf(item('a', null, text('Hi'))), { fonts });
      const descriptor = only(pdf.ofType('FontDescriptor'));
      expect(pdf.name(descriptor.dict, 'FontName')).toBe('LiberationSans');
      const program = pdf.bytesAt(descriptor.dict, 'FontFile2')!;
      expect(Buffer.from(program).equals(Buffer.from(ttf.bytes))).toBe(true);
    });
  });

  it('outlines-only font draws paths and is listed in report.outlinedForLicence; no font object for it', async () => {
    const restricted = withFile((file) => ({ ...file, embeddable: 'outlines-only' }));
    const { pdf, report, bytes } = await write(sceneOf(item('a', null, text('So'))), {
      fonts: restricted,
    });
    expect(report.outlinedForLicence).toEqual(['Instrument Sans']);
    expect(pdf.ofType('FontDescriptor')).toHaveLength(0);
    expect(pdf.ofType('Font')).toHaveLength(0);
    const content = pdf.content(0);
    expect(content).not.toContain('BT');
    expect(content).toMatch(/ c /); // curves of the glyphs
    expect(content).toMatch(/\nf\n/);
    expect(await extractText(bytes)).toEqual([]);
  });

  it('draws bitmap-only fonts as a picture', async () => {
    const bitmapOnly = withFile((file) => ({ ...file, embeddable: 'bitmap-only' }));
    const { pdf, report, calls } = await write(sceneOf(item('a', null, text('Hi'))), {
      fonts: bitmapOnly,
    });
    expect(report.rasterIslands).toEqual([{ page: 1, elementId: 'a', reason: 'bitmap-only-font' }]);
    expect(calls).toHaveLength(1);
    expect(pdf.pictures()).toHaveLength(1);
    expect(pdf.ofType('FontDescriptor')).toHaveLength(0);
  });

  it('missing glyph run is reported and kept', async () => {
    // 'Ā' is outside the latin file; the runs around it are real text.
    const op = text('AĀB');
    const { pdf, report, calls, bytes } = await write(sceneOf(item('m', 'Mix', op)));
    expect(report.missingGlyphs).toEqual([{ page: 1, elementId: 'm', text: 'Ā' }]);
    expect(report.rasterIslands).toEqual([{ page: 1, elementId: 'm', reason: 'missing-glyph' }]);
    const image = only(pdf.pictures());
    expect(pdf.number(image.dict, 'Width')).toBeGreaterThan(0);
    expect((await extractText(bytes)).join('').replace(/\s/g, '')).toBe('AB');
    // The island is the run alone, with the state of its op, at the ratio asked for.
    const call = only(calls);
    expect(call.pixelRatio).toBe(2);
    const [island] = call.ops;
    expect(island).toMatchObject({ kind: 'text', text: 'Ā', shadow: null });
  });

  it('draws text whose face has no file as one picture and says why', async () => {
    const { pdf, report } = await write(sceneOf(item('n', null, text('Hallo'))), {
      fonts: new Map(),
    });
    expect(report.rasterIslands).toEqual([{ page: 1, elementId: 'n', reason: 'font-unavailable' }]);
    expect(report.missingGlyphs).toEqual([{ page: 1, elementId: 'n', text: 'Hallo' }]);
    expect(pdf.pictures()).toHaveLength(1);
  });

  it('says so when a picture cannot be made, and writes the rest', async () => {
    const op = text('AĀB');
    const { pdf, report } = await write(
      sceneOf(item('m', null, op)),
      {},
      napiRasterize({ returns: 'null' })
    );
    expect(report.missingElements).toEqual([
      { page: 1, elementId: 'm', reason: 'image-unreadable' },
    ]);
    // An island nobody could draw is missing, and not also an island.
    expect(report.rasterIslands).toEqual([]);
    expect(pdf.pictures()).toHaveLength(0);
    expect(pdf.content(0)).toContain('BT');
  });
});

// ---------------------------------------------------------------------------------------------

const stops = (...entries: [number, string, number?][]): ColorStop[] =>
  entries.map(([offset, hex, alpha = 1]) => ({ offset, hex, alpha }));

describe('paths', () => {
  it('vector-only scene has no image xobject', async () => {
    const scene = sceneOf(
      item('a', null, fill(squareAt(10, 10), solid('#336699')), {
        ...fill(squareAt(60, 10), solid('#cc3300')),
        mode: 'stroke',
        stroke: {
          width: 2,
          cap: 'round',
          join: 'bevel',
          miterLimit: 10,
          dash: [4, 2],
          dashOffset: 1,
        },
      }),
      item('t', null, text('Hallo'))
    );
    const { pdf, calls } = await write(scene);
    expect(pdf.ofType('Image')).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('writes fills, strokes and their state as operators', async () => {
    const scene = sceneOf(
      item(
        'a',
        null,
        { ...fill(squareAt(0, 0), solid('#336699')), rule: 'evenodd' },
        {
          ...fill(squareAt(0, 0), solid('#ff0000')),
          mode: 'stroke',
          stroke: {
            width: 2,
            cap: 'round',
            join: 'bevel',
            miterLimit: 10,
            dash: [4, 2],
            dashOffset: 1,
          },
        },
        {
          ...fill(squareAt(0, 0), solid('#00ff00')),
          mode: 'stroke',
          stroke: {
            width: 3,
            cap: 'square',
            join: 'miter',
            miterLimit: 3,
            dash: [],
            dashOffset: 0,
          },
        }
      )
    );
    const content = (await write(scene)).pdf.content(0);
    expect(content).toContain('0.2 0.4 0.6 rg\n0 0 m 40 0 l 40 40 l 0 40 l h\nf*');
    expect(content).toContain('1 0 0 RG\n2 w\n1 J\n2 j\n[4 2] 1 d');
    expect(content).toContain('0 1 0 RG\n3 w\n2 J\n0 j\n3 M\n[] 0 d');
    expect(content).toContain('\nS\n');
  });

  it('writes a quadratic segment as the cubic of the same shape', async () => {
    const commands: PathCommand[] = [
      { op: 'M', x: 0, y: 0 },
      { op: 'Q', x1: 30, y1: 0, x: 30, y: 30 },
    ];
    const content = (
      await write(sceneOf(item('q', null, fill(commands, solid('#000000')))))
    ).pdf.content(0);
    expect(content).toContain('0 0 m 20 0 30 10 30 30 c');
  });

  it('draws nothing under a matrix that squeezes the plane flat', async () => {
    const flat: Matrix = [1, 0, 1, 0, 0, 0];
    const op = fill(squareAt(0, 0), solid('#336699'), { matrix: flat });
    expect((await write(sceneOf(item('a', null, op)))).pdf.content(0)).not.toContain('rg');
  });

  it('alpha uses ExtGState ca/CA', async () => {
    const scene = sceneOf(
      item(
        'a',
        null,
        fill(squareAt(0, 0), solid('#336699'), { alpha: 0.5 }),
        fill(squareAt(50, 0), solid('#336699', 0.4), { alpha: 0.5 }),
        fill(squareAt(100, 0), solid('#336699'))
      )
    );
    const { pdf } = await write(scene);
    const states = pdf
      .ofType('ExtGState')
      .map(({ dict }) => [pdf.number(dict, 'ca'), pdf.number(dict, 'CA')]);
    expect(states).toEqual([
      [0.5, 0.5],
      [0.2, 0.2],
    ]);
    const content = pdf.content(0);
    expect(content.match(/\/GS\d+ gs/g)).toHaveLength(2);
  });

  it('linear and radial gradients become shading patterns', async () => {
    const linear: Paint = {
      type: 'linear',
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 60,
      stops: stops([0, '#00a050'], [0.25, '#ffffff'], [1, '#005030']),
    };
    const radial: Paint = {
      type: 'radial',
      x0: 50,
      y0: 30,
      r0: 0,
      x1: 50,
      y1: 30,
      r1: 60,
      stops: stops([0, '#ff0000'], [1, '#0000ff']),
    };
    const scene = sceneOf(
      item(
        'g',
        null,
        fill(rect(0, 0, 100, 60), linear, { matrix: [1, 0, 0, 1, 30, 40] }),
        fill(rect(0, 0, 100, 60), radial),
        { ...fill(rect(0, 0, 100, 60), linear), mode: 'stroke', stroke: null }
      )
    );
    const { pdf } = await write(scene);
    const patterns = pdf.objects.filter((o) => pdf.number(o.dict, 'PatternType') === 2);
    // Two fills and a stroke: the stroke has the same gradient and the same matrix as the first
    // fill only if the op matrix is the same; here it is not.
    expect(patterns).toHaveLength(3);
    const [first, second] = patterns;
    // Under the page flip [1 0 0 -1 0 300] the op matrix [1 0 0 1 30 40] is [1 0 0 -1 30 260].
    expect(pdf.numbers(first!.dict, 'Matrix')).toEqual([1, 0, 0, -1, 30, 260]);
    const axial = pdf.dictAt(first!.dict, 'Shading')!;
    expect(pdf.number(axial, 'ShadingType')).toBe(2);
    expect(pdf.numbers(axial, 'Coords')).toEqual([0, 0, 100, 60]);
    expect(pdf.name(axial, 'ColorSpace')).toBe('DeviceRGB');
    const fn = pdf.dictAt(axial, 'Function')!;
    expect(pdf.number(fn, 'FunctionType')).toBe(3);
    expect(pdf.numbers(fn, 'Bounds')).toEqual([0.25]);
    expect(pdf.arrayAt(fn, 'Functions')).toHaveLength(2);
    expect(String(axial.get(PDFName.of('Extend')))).toBe('[ true true ]');
    const circles = pdf.dictAt(second!.dict, 'Shading')!;
    expect(pdf.number(circles, 'ShadingType')).toBe(3);
    expect(pdf.numbers(circles, 'Coords')).toEqual([50, 30, 0, 50, 30, 60]);
    const content = pdf.content(0);
    expect(content).toMatch(/\/Pattern cs \/P\d+ scn/);
    expect(content).toMatch(/\/Pattern CS \/P\d+ SCN/);
  });

  it('writes a hard stop as two segments that meet', async () => {
    const hard: Paint = {
      type: 'linear',
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 0,
      stops: stops([0, '#ff0000'], [0.5, '#ff0000'], [0.5, '#0000ff'], [1, '#0000ff']),
    };
    const { pdf } = await write(sceneOf(item('h', null, fill(rect(0, 0, 100, 10), hard))));
    const pattern = pdf.objects.find((o) => pdf.number(o.dict, 'PatternType') === 2)!;
    const fn = pdf.dictAt(pdf.dictAt(pattern.dict, 'Shading')!, 'Function')!;
    expect(pdf.numbers(fn, 'Bounds')).toEqual([0.5]);
  });

  it('extends a gradient that starts late and ends early to the whole range', async () => {
    const short: Paint = {
      type: 'linear',
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 0,
      stops: stops([0.2, '#ff0000'], [0.6, '#0000ff']),
    };
    const { pdf } = await write(sceneOf(item('h', null, fill(rect(0, 0, 100, 10), short))));
    const pattern = pdf.objects.find((o) => pdf.number(o.dict, 'PatternType') === 2)!;
    const fn = pdf.dictAt(pdf.dictAt(pattern.dict, 'Shading')!, 'Function')!;
    expect(pdf.numbers(fn, 'Bounds')).toEqual([0.2, 0.6]);
    expect(pdf.numbers(fn, 'Domain')).toEqual([0, 1]);
  });

  it('puts a gradient that fades through a soft mask, and a flat alpha into the graphics state', async () => {
    const fading: Paint = {
      type: 'linear',
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 0,
      stops: stops([0, '#ff0000', 1], [1, '#ff0000', 0]),
    };
    const flat: Paint = { ...fading, stops: stops([0, '#ff0000', 0.5], [1, '#0000ff', 0.5]) };
    const scene = sceneOf(
      item('f', null, fill(rect(0, 0, 100, 10), fading), fill(rect(0, 20, 100, 10), flat))
    );
    const { pdf } = await write(scene);
    const states = pdf.ofType('ExtGState');
    const masked = states.filter(({ dict }) => dict.has(PDFName.of('SMask')));
    expect(masked).toHaveLength(1);
    const mask = pdf.dictAt(masked[0]!.dict, 'SMask')!;
    expect(pdf.name(mask, 'S')).toBe('Luminosity');
    const group = pdf.dictAt(mask, 'G')!;
    expect(pdf.name(pdf.dictAt(group, 'Group')!, 'S')).toBe('Transparency');
    expect(pdf.name(pdf.dictAt(group, 'Group')!, 'CS')).toBe('DeviceGray');
    // The mask paints the alphas as gray with the same geometry.
    const gray = pdf.dictAt(pdf.dictAt(group, 'Resources')!, 'Shading')!;
    const shading = pdf.dictAt(gray, 'Sh1')!;
    expect(pdf.name(shading, 'ColorSpace')).toBe('DeviceGray');
    expect(pdf.numbers(shading, 'Coords')).toEqual([0, 0, 100, 0]);
    // The flat one needs no mask: ca/CA = 0.5.
    const unmasked = states.filter(({ dict }) => !dict.has(PDFName.of('SMask')));
    expect(unmasked.map(({ dict }) => pdf.number(dict, 'ca'))).toEqual([0.5]);
  });

  it('paints nothing for a gradient with no extent', async () => {
    const none: Paint = {
      type: 'linear',
      x0: 5,
      y0: 5,
      x1: 5,
      y1: 5,
      stops: stops([0, '#ff0000'], [1, '#0000ff']),
    };
    const { pdf } = await write(sceneOf(item('n', null, fill(rect(0, 0, 100, 10), none))));
    expect(pdf.content(0)).not.toContain('scn');
    expect(pdf.objects.filter((o) => pdf.number(o.dict, 'PatternType') !== null)).toHaveLength(0);
  });

  it('pattern paint becomes a tiling pattern with the tile as image', async () => {
    const tile = bitmap(png, 16, 8);
    const op = fill(
      rect(0, 0, 60, 60),
      { type: 'pattern', image: tile, repeat: 'repeat', matrix: [2, 0, 0, 2, 3, 4] },
      { matrix: [1, 0, 0, 1, 20, 200] }
    );
    const { pdf } = await write(sceneOf(item('p', null, op)));
    const pattern = only(pdf.objects.filter((o) => pdf.number(o.dict, 'PatternType') === 1));
    expect(pdf.numbers(pattern.dict, 'BBox')).toEqual([0, 0, 16, 8]);
    expect(pdf.number(pattern.dict, 'XStep')).toBe(16);
    expect(pdf.number(pattern.dict, 'YStep')).toBe(8);
    // page flip · op matrix · pattern matrix, applied to the tile cell
    expect(pdf.numbers(pattern.dict, 'Matrix')).toEqual([2, 0, 0, -2, 23, 300 - 204]);
    const resources = pdf.dictAt(pattern.dict, 'Resources')!;
    const image = pdf.dictAt(pdf.dictAt(resources, 'XObject')!, 'Im1')!;
    expect(pdf.name(image, 'Subtype')).toBe('Image');
    // An upright image in a y-down cell: the unit square is turned over.
    expect(streamText(pattern)).toBe('q 16 0 0 -8 0 8 cm /Im1 Do Q');
    expect(pdf.content(0)).toMatch(/\/Pattern cs \/P\d+ scn/);
  });

  describe('an SVG tile', () => {
    const tile: Extract<SceneImageSource, { kind: 'svg' }> = {
      kind: 'svg',
      markup:
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="4" height="4" fill="#336699"/></svg>',
      width: 8,
      height: 8,
    };
    const tiled = (y: number) =>
      fill(
        rect(0, y, 60, 30),
        { type: 'pattern', image: tile, repeat: 'repeat', matrix: [1, 0, 0, 1, 0, 0] },
        { matrix: [1, 0, 0, 1, 20, 20] }
      );

    it('is drawn once and reported once, however often it paints', async () => {
      const scene = sceneOf(item('p', null, tiled(0), tiled(40)), item('q', null, tiled(80)));
      const { pdf, report, calls } = await write(scene);
      expect(calls).toHaveLength(1);
      expect(report.rasterIslands).toEqual([
        { page: 1, elementId: 'p', reason: 'unsupported-pattern' },
      ]);
      // One pattern per matrix, one picture for all of them.
      expect(pdf.pictures()).toHaveLength(1);
      expect(pdf.content(0).match(/\/Pattern cs/g)).toHaveLength(3);
    });

    it('is missing, and no island, when nobody can draw it', async () => {
      const { report, pdf } = await write(
        sceneOf(item('p', null, tiled(0), tiled(40))),
        {},
        napiRasterize({ returns: 'null' })
      );
      expect(report.rasterIslands).toEqual([]);
      expect(report.missingElements).toHaveLength(2);
      expect(pdf.content(0)).not.toContain('scn');
    });
  });

  it('clips emit W n inside q/Q', async () => {
    const clipA: ClipPath = { matrix: IDENTITY, commands: rect(20, 20, 100, 100), rule: 'nonzero' };
    const clipB: ClipPath = {
      matrix: [1, 0, 0, 1, 40, 10],
      commands: rect(0, 0, 30, 30),
      rule: 'evenodd',
    };
    const op = fill(squareAt(30, 30), solid('#336699'), { clips: [clipA, clipB] });
    const content = (await write(sceneOf(item('c', null, op)))).pdf.content(0);
    expect(content).toContain(
      'q\n20 20 m 120 20 l 120 120 l 20 120 l h W n\n' +
        '40 10 m 70 10 l 70 40 l 40 40 l h W* n\n' +
        '0.2 0.4 0.6 rg\n30 30 m 70 30 l 70 70 l 30 70 l h\nf\nQ'
    );
  });

  it('drops an op under a clip that clips everything', async () => {
    const nothing: ClipPath = { matrix: IDENTITY, commands: [], rule: 'nonzero' };
    const op = fill(squareAt(0, 0), solid('#336699'), { clips: [nothing] });
    expect((await write(sceneOf(item('c', null, op)))).pdf.content(0)).not.toContain(' rg');
  });
});

// ---------------------------------------------------------------------------------------------

describe('groups', () => {
  const two = (alpha: number): SceneOp => ({
    ...base({ alpha }),
    kind: 'group',
    ops: [fill(squareAt(0, 0), solid('#ff0000')), fill(squareAt(20, 20), solid('#0000ff'))],
    shadow: null,
  });

  it('applies the alpha of a group of several to the group as a whole', async () => {
    const { pdf } = await write(sceneOf(item('g', null, two(0.5))));
    const form = only(pdf.ofType('Form'));
    expect(pdf.number(pdf.dictAt(form.dict, 'Group')!, 'I')).toBeNull(); // a boolean
    expect(pdf.name(pdf.dictAt(form.dict, 'Group')!, 'S')).toBe('Transparency');
    expect(pdf.numbers(form.dict, 'BBox')).toEqual([0, 0, 400, 300]);
    // The children are in the form, the alpha outside.
    expect(streamText(form)).toContain('1 0 0 rg');
    expect(streamText(form)).toContain('0 0 1 rg');
    const content = pdf.content(0);
    expect(content).toMatch(/\/GS1 gs\n\/Im1 Do/);
    expect(content).not.toContain('rg');
    expect(only(pdf.ofType('ExtGState')).dict.has(PDFName.of('ca'))).toBe(true);
  });

  it('gives the form the resources it draws with, and not itself among them', async () => {
    const { pdf } = await write(sceneOf(item('g', null, two(0.5))));
    const form = only(pdf.ofType('Form'));
    const resources = pdf.dictAt(form.dict, 'Resources')!;
    // The page lists the form; the form's own dictionary is a copy made before it was listed.
    const page = pdf.dictAt(pdf.doc.getPage(0).node, 'Resources')!;
    expect(pdf.dictAt(page, 'XObject')!.keys()).toHaveLength(1);
    expect(resources.has(PDFName.of('XObject'))).toBe(false);
  });

  it('gives a group of one its alpha without a form', async () => {
    const group: SceneOp = {
      ...base({ alpha: 0.5 }),
      kind: 'group',
      ops: [fill(squareAt(0, 0), solid('#ff0000'), { alpha: 0.5 })],
      shadow: null,
    };
    const { pdf } = await write(sceneOf(item('g', null, group)));
    expect(pdf.ofType('Form')).toHaveLength(0);
    const state = only(pdf.ofType('ExtGState'));
    expect(pdf.number(state.dict, 'ca')).toBe(0.25);
  });

  it('writes an opaque group as its children', async () => {
    const { pdf } = await write(sceneOf(item('g', null, two(1))));
    expect(pdf.ofType('Form')).toHaveLength(0);
    expect(pdf.content(0).match(/ rg/g)).toHaveLength(2);
  });

  it('places a gradient or a pattern in a group by the group matrix too', async () => {
    const linear: Paint = {
      type: 'linear',
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 0,
      stops: stops([0, '#ff0000'], [1, '#0000ff']),
    };
    const tile = bitmap(png, 16, 8);
    const tiling: Paint = { type: 'pattern', image: tile, repeat: 'repeat', matrix: IDENTITY };
    const group: SceneOp = {
      ...base({ matrix: [1, 0, 0, 1, 30, 40] }),
      kind: 'group',
      shadow: null,
      ops: [
        fill(rect(0, 0, 100, 10), linear, { matrix: [2, 0, 0, 2, 0, 0] }),
        fill(rect(0, 20, 100, 10), tiling),
      ],
    };
    const { pdf } = await write(sceneOf(item('g', null, group)));
    expect(pdf.ofType('Form')).toHaveLength(0); // opaque: its children, under one cm
    const matrices = pdf.objects
      .filter((o) => pdf.number(o.dict, 'PatternType') !== null)
      .map((o) => pdf.numbers(o.dict, 'Matrix'));
    // page flip · group matrix (· op matrix)
    expect(matrices).toContainEqual([2, 0, 0, -2, 30, 260]);
    expect(matrices).toContainEqual([1, 0, 0, -1, 30, 260]);
  });

  it('clips a group once', async () => {
    const clip: ClipPath = { matrix: IDENTITY, commands: rect(0, 0, 30, 30), rule: 'nonzero' };
    const group = { ...two(1), clips: [clip] };
    const content = (await write(sceneOf(item('g', null, group)))).pdf.content(0);
    expect(content).toContain('q\n0 0 m 30 0 l 30 30 l 0 30 l h W n\nq\n');
    expect(content.match(/W n/g)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------

describe('images', () => {
  const imageOp = (over: Partial<Extract<SceneOp, { kind: 'image' }>> = {}): SceneOp => ({
    ...base({ matrix: [1, 0, 0, 1, 200, 20] }),
    kind: 'image',
    image: bitmap(png, 4, 4),
    sx: 0,
    sy: 0,
    sw: 4,
    sh: 4,
    dx: 0,
    dy: 0,
    dw: 80,
    dh: 40,
    ...over,
  });

  it('draws the unit square, stood on its head, over the destination', async () => {
    const { pdf } = await write(sceneOf(item('p', null, imageOp())));
    const image = only(pdf.pictures());
    expect(pdf.number(image.dict, 'Width')).toBe(4);
    expect(pdf.name(image.dict, 'Filter')).toBe('FlateDecode');
    expect(pdf.content(0)).toContain('1 0 0 1 200 20 cm\nq 80 0 0 -40 0 40 cm /Im1 Do Q');
  });

  it('keeps a JPEG a JPEG', async () => {
    const photo = { ...bitmap(jpeg, 4, 4), mime: 'image/jpeg' as const };
    const { pdf } = await write(sceneOf(item('p', null, imageOp({ image: photo }))));
    expect(pdf.name(only(pdf.pictures()).dict, 'Filter')).toBe('DCTDecode');
  });

  it('crops with a clip to the destination and places the whole picture where it lands', async () => {
    const { pdf } = await write(
      sceneOf(
        item('p', null, imageOp({ sx: 2, sy: 2, sw: 2, sh: 2, dx: 10, dy: 10, dw: 40, dh: 40 }))
      )
    );
    const content = pdf.content(0);
    expect(content).toContain('10 10 40 40 re W n');
    // The whole 4x4 picture at 20 px per source px, its corner 2 source px left of the destination.
    expect(content).toContain('80 0 0 -80 -30 50 cm');
  });

  it('draws one picture once for any number of uses', async () => {
    const shared = bitmap(png, 4, 4);
    const { pdf } = await write(
      sceneOf(item('p', null, imageOp({ image: shared }), imageOp({ image: shared, dx: 100 })))
    );
    expect(pdf.pictures()).toHaveLength(1);
  });

  it('says a picture is missing when its bytes cannot be read', async () => {
    const broken = { ...bitmap(png, 4, 4), bytes: Uint8Array.from([1, 2, 3]) };
    const { report, pdf } = await write(sceneOf(item('p', null, imageOp({ image: broken }))));
    expect(report.missingElements).toEqual([
      { page: 1, elementId: 'p', reason: 'image-unreadable' },
    ]);
    expect(pdf.pictures()).toHaveLength(0);
  });

  it('draws a raster op from its pixels, or from its ops when it has none', async () => {
    const withPixels: SceneOp = {
      ...base(),
      kind: 'raster',
      png,
      x: 10,
      y: 20,
      width: 50,
      height: 30,
      reason: 'filter',
      source: null,
    };
    const withOps: SceneOp = {
      ...withPixels,
      png: null,
      source: [fill(squareAt(0, 0), solid('#336699'))],
    };
    const { pdf } = await write(sceneOf(item('r', null, withPixels, withOps)));
    expect(pdf.pictures()).toHaveLength(1);
    expect(pdf.content(0)).toContain('50 0 0 -30 10 50 cm');
    expect(pdf.content(0)).toContain('0.2 0.4 0.6 rg');
  });
});

// ---------------------------------------------------------------------------------------------

const ICON = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${inner}</svg>`;

describe('svg images', () => {
  it('svg image ops are converted via svgToScene', async () => {
    const markup = ICON('<path d="M2 2h20v20H2z" fill="#ff0000"/>');
    const op = svgImage(markup, { dx: 10, dy: 20, dw: 48, dh: 48 });
    const { pdf, calls, report } = await write(sceneOf(item('i', null, op)));
    expect(calls).toHaveLength(0);
    expect(pdf.ofType('Image')).toHaveLength(0);
    expect(report.rasterIslands).toEqual([]);
    const content = pdf.content(0);
    expect(content).toContain('1 0 0 rg');
    // 24 px natural size drawn at 48: scale 2, at (10, 20)
    expect(content).toContain('2 0 0 2 10 20 cm');
  });

  it('gives the image op its alpha, its clips and its crop', async () => {
    const markup = ICON(
      '<path d="M0 0h24v24H0z" fill="#ff0000"/><path d="M0 0h12v12H0z" fill="#0000ff"/>'
    );
    const clip: ClipPath = { matrix: IDENTITY, commands: rect(0, 0, 500, 500), rule: 'nonzero' };
    const op = svgImage(markup, {
      alpha: 0.5,
      clips: [clip],
      sx: 0,
      sy: 0,
      sw: 12,
      sh: 12,
      dx: 10,
      dy: 10,
      dw: 24,
      dh: 24,
    });
    const { pdf } = await write(sceneOf(item('i', null, op)));
    // Two paths and an alpha: a transparency group, inside the clip and the crop.
    expect(pdf.ofType('Form')).toHaveLength(1);
    const content = pdf.content(0);
    expect(content).toContain('0 0 m 500 0 l 500 500 l 0 500 l h W n');
    expect(content).toContain('10 10 m 34 10 l 34 34 l 10 34 l h W n');
    expect(content).toContain('/GS1 gs');
  });

  it('unsupported constructs raster that image and report svg-unsupported', async () => {
    const markup = ICON(
      '<filter id="b"><feGaussianBlur stdDeviation="2"/></filter><rect width="24" height="24" fill="#ff0000" filter="url(#b)"/>'
    );
    const op = svgImage(markup, { dx: 10, dy: 20, dw: 48, dh: 48 });
    const { pdf, calls, report } = await write(sceneOf(item('i', null, op)));
    expect(report.rasterIslands).toEqual([{ page: 1, elementId: 'i', reason: 'svg-unsupported' }]);
    expect(pdf.pictures()).toHaveLength(1);
    const call = only(calls);
    expect(call.ops).toHaveLength(1);
    expect(call.ops[0]).toMatchObject({ kind: 'image', shadow: null });
    expect(call.box).toEqual({ x: 10, y: 20, width: 48, height: 48 });
    expect(pdf.content(0)).not.toContain(' rg');
  });

  it('draws chart text in the document font', async () => {
    const markup = ICON(
      '<text x="2" y="12" font-family="sans-serif" font-size="10" fill="#112233">Hi</text>'
    );
    const scene = sceneOf(item('t', null, text('Hallo')), item('i', null, svgImage(markup)));
    const { bytes, pdf, report } = await write(scene);
    expect(report.rasterIslands).toEqual([]);
    expect((await extractText(bytes)).join('')).toBe('HalloHi');
    expect(pdf.ofType('Type0')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------

describe('shadows', () => {
  const shadow = { hex: '#000000', alpha: 0.5, blur: 8, offsetX: 6, offsetY: 6 };
  const shape = () => ({
    ...fill(squareAt(100, 100), solid('#ff0000'), { matrix: [1, 0, 0, 1, 10, 5] }),
    shadow,
  });

  it('shadow with blur: shadow is a raster under vector content', async () => {
    const { pdf, calls, report } = await write(sceneOf(item('s', null, shape())));
    expect(report.rasterIslands).toEqual([{ page: 1, elementId: 's', reason: 'shadow' }]);
    expect(pdf.pictures()).toHaveLength(1);
    const content = pdf.content(0);
    // The picture first, then the shape, which stays a vector.
    expect(content.indexOf(' Do')).toBeGreaterThan(-1);
    expect(content.indexOf(' Do')).toBeLessThan(content.indexOf('1 0 0 rg'));
    expect(content).toContain('100 100 m 140 100 l 140 140 l 100 140 l h\nf');

    // The picture asks for the shadow alone: the shape is moved off to the left, the shadow
    // offset to the right by as much.
    const call = only(calls);
    const [op] = call.ops;
    expect(op).toMatchObject({ kind: 'path' });
    const moved = op!.matrix[4] - 10;
    expect(110 + 40 + moved).toBeLessThan(call.box.x); // the shape's right edge, left of the picture
    expect(op!.shadow).toEqual({ ...shadow, offsetX: shadow.offsetX - moved });
    expect(op!.matrix[5]).toBe(5);
    // The box holds the shadow, reaching three sigma past the shape moved by the offset.
    expect(call.box.x).toBeLessThanOrEqual(110 + 6 - 12);
    expect(call.box.x + call.box.width).toBeGreaterThanOrEqual(150 + 6 + 12);
    expect(call.pixelRatio).toBe(2);
  });

  it('makes a picture that holds the shadow and not the shape', async () => {
    const { calls, canvasOf } = napiRasterize();
    const raster = napiRasterize();
    await write(sceneOf(item('s', null, shape())), {}, raster);
    const call = only(raster.calls);
    const canvas = await canvasOf(call.ops, call.box, call.pixelRatio);
    const ctx = canvas.getContext('2d');
    const pixelAtPage = (x: number, y: number) =>
      ctx.getImageData(
        Math.round((x - call.box.x) * call.pixelRatio),
        Math.round((y - call.box.y) * call.pixelRatio),
        1,
        1
      ).data;
    // The shape is red; nothing red is in the picture, only the black of the shadow.
    const all = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    expect(all.some((value, i) => i % 4 === 3 && value > 0)).toBe(true);
    expect(all.some((value, i) => i % 4 === 0 && value > 0)).toBe(false);
    // Under the shape's far corner the shadow is: black at the alpha of the shadow colour.
    const under = pixelAtPage(135, 125); // in the shape and in the shadow
    expect(under[0]).toBe(0);
    expect(under[3]).toBeGreaterThan(100);
    expect(calls).toHaveLength(0);
  });

  it('keeps the shadow of a text op as a picture and the text as text', async () => {
    const op = { ...text('Hallo'), shadow };
    const { pdf, bytes, report } = await write(sceneOf(item('t', null, op)));
    expect(report.rasterIslands).toEqual([{ page: 1, elementId: 't', reason: 'shadow' }]);
    expect(pdf.pictures()).toHaveLength(1);
    expect((await extractText(bytes)).join('')).toBe('Hallo');
  });

  it('writes no picture for a shadow that is not drawn', async () => {
    const scene = sceneOf(
      item(
        's',
        null,
        { ...shape(), shadow: { ...shadow, blur: 0, offsetX: 0, offsetY: 0 } },
        { ...shape(), shadow: { ...shadow, alpha: 0 } }
      )
    );
    const { calls } = await write(scene);
    expect(calls).toHaveLength(0);
  });

  it('puts the shadow of a group under the group', async () => {
    const group: SceneOp = {
      ...base({ alpha: 0.5 }),
      kind: 'group',
      ops: [fill(squareAt(10, 10), solid('#ff0000')), fill(squareAt(30, 30), solid('#0000ff'))],
      shadow,
    };
    const { pdf, calls } = await write(sceneOf(item('g', null, group)));
    expect(only(calls).ops[0]).toMatchObject({ kind: 'group', alpha: 0.5 });
    expect(pdf.pictures()).toHaveLength(1);
    expect(pdf.ofType('Form')).toHaveLength(1);
  });

  it('writes the vector op and says so when the shadow cannot be made', async () => {
    const { pdf, report } = await write(
      sceneOf(item('s', null, shape())),
      {},
      napiRasterize({ returns: 'null' })
    );
    expect(report.missingElements).toEqual([
      { page: 1, elementId: 's', reason: 'image-unreadable' },
    ]);
    expect(pdf.content(0)).toContain('1 0 0 rg');
  });
});

// ---------------------------------------------------------------------------------------------

describe('print mode', () => {
  const trimMm = { width: 210, height: 297 };
  const bleedMm = 3;
  const geometry = pdfPageGeometry({ trimMm, bleedMm });
  // The canvas covers trim + bleed: 2 px to the mm here.
  const canvas = (...items: ReturnType<typeof item>[]): ExportScene => ({
    ...sceneOf(...items),
    width: (210 + 6) * 2,
    height: (297 + 6) * 2,
  });
  const writePrint = (scene: ExportScene) =>
    write(scene, { mode: 'print', print: { trimMm, bleedMm } });

  it('print boxes equal pdfPageGeometry and crop marks are present', async () => {
    const { pdf } = await writePrint(
      canvas(item('a', null, fill(rect(0, 0, 5, 5), solid('#000'))))
    );
    const page = pdf.doc.getPage(0);
    for (const [name, got, want] of [
      ['media', page.getMediaBox(), geometry.mediaBox],
      ['bleed', page.getBleedBox(), geometry.bleedBox],
      ['trim', page.getTrimBox(), geometry.trimBox],
    ] as const) {
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(got[key], `${name}.${key}`).toBeCloseTo(want[key], 3);
      }
    }
    // Eight marks, 0.25 pt, 100 % K, from the shared mark code.
    const content = pdf.content(0);
    expect(content).toContain('0 0 0 1 K');
    expect(content).toContain('0.25 w');
    const marks = cropMarkLines({ trimMm, bleedMm });
    expect(marks).toHaveLength(8);
    for (const { start, end } of marks) {
      expect(content).toContain(
        `${num(start.x)} ${num(start.y)} m ${num(end.x)} ${num(end.y)} l S`
      );
    }
  });

  it('keeps the marks 100 % K when the brand has a CMYK map', async () => {
    const scene = canvas(item('a', null, fill(rect(0, 0, 5, 5), solid('#0f3a52'))));
    const { pdf } = await write(scene, {
      mode: 'print',
      print: { trimMm, bleedMm },
      cmyk: { '#0f3a52': [100, 60, 30, 40] },
    });
    const content = pdf.content(0);
    expect(content).toContain('0 0 0 1 K');
    expect(content).toContain('1 0.6 0.3 0.4 k');
  });

  it('places the canvas on the bleed box, clipped to it', async () => {
    // A red square in the canvas corner, and a blue one far outside the canvas.
    const scene = canvas(
      item(
        'a',
        null,
        fill(rect(0, 0, 40, 40), solid('#ff0000')),
        fill(rect(-200, -200, 198, 198), solid('#0000ff'))
      )
    );
    const { bytes } = await writePrint(scene);
    const picture = await renderPage(bytes, 0, 1);
    const at = (x: number, y: number) =>
      Array.from(picture.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data);
    const { bleedBox } = geometry;
    const top = geometry.mediaBox.height - (bleedBox.y + bleedBox.height); // y down
    // Inside the bleed box, at the canvas corner: red.
    expect(at(bleedBox.x + 10, top + 10)).toEqual([255, 0, 0, 255]);
    // In the mark margin the blue square, which hangs out of the canvas, is not drawn.
    expect(at(bleedBox.x - 4, top - 4)).toEqual([255, 255, 255, 255]);
    // The scale is trim + bleed in pt over canvas px: 40 px is 20 mm.
    expect(at(bleedBox.x + (40 * (216 * 72)) / 25.4 / scene.width - 2, top + 10)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(at(bleedBox.x + (40 * (216 * 72)) / 25.4 / scene.width + 3, top + 10)).toEqual([
      255, 255, 255, 255,
    ]);
  });

  it('maps a gradient by the placement of the page, not by the plain flip', async () => {
    const linear: Paint = {
      type: 'linear',
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 0,
      stops: stops([0, '#ff0000'], [1, '#0000ff']),
    };
    const scene = canvas(item('g', null, fill(rect(0, 0, 100, 10), linear)));
    const { pdf } = await writePrint(scene);
    const pattern = only(pdf.objects.filter((o) => pdf.number(o.dict, 'PatternType') === 2));
    const { bleedBox } = geometry;
    const want = [
      bleedBox.width / scene.width,
      0,
      0,
      -bleedBox.height / scene.height,
      bleedBox.x,
      bleedBox.y + bleedBox.height,
    ];
    pdf
      .numbers(pattern.dict, 'Matrix')!
      .forEach((got, at) => expect(got).toBeCloseTo(want[at]!, 3));
  });

  it('writes one page of this size per scene', async () => {
    const { pdf } = await writePrint(canvas());
    expect(pdf.doc.getPageCount()).toBe(1);
    const { width, height } = pdf.doc.getPage(0).getSize();
    expect(width).toBeCloseTo(geometry.mediaBox.width, 3);
    expect(height).toBeCloseTo(geometry.mediaBox.height, 3);
  });
});

describe('slides mode', () => {
  it('slides pages are SLIDE_PDF_PAGE_PT', async () => {
    const full: ExportScene = {
      ...sceneOf(item('a', null, fill(rect(0, 0, 5, 5), solid('#000')))),
      width: 1920,
      height: 1080,
    };
    const half: ExportScene = { ...full, width: 960, height: 540 };
    const { pdf } = await write([full, half], { mode: 'slides' });
    expect(pdf.doc.getPage(0).getSize()).toEqual(SLIDE_PDF_PAGE_PT);
    expect(pdf.doc.getPage(1).getSize()).toEqual(SLIDE_PDF_PAGE_PT);
    // No marks, no boxes of print: the scene fills the page, a half-size one scaled up.
    expect(pdf.content(0).startsWith('1 0 0 -1 0 1080 cm\n')).toBe(true);
    expect(pdf.content(1).startsWith('2 0 0 -2 0 1080 cm\n')).toBe(true);
    expect(pdf.content(0)).not.toContain(' K');
    expect(pdf.doc.getPage(0).node.has(PDFName.of('TrimBox'))).toBe(false);
  });
});

describe('cmyk', () => {
  const INK = '#0f3a52';
  const cmyk = { [INK]: [100, 60, 30, 40] } as const;

  it('mapped brand colours are DeviceCMYK with exact values, others RGB', async () => {
    const scene = sceneOf(
      item(
        'a',
        null,
        fill(rect(0, 0, 40, 40), solid(INK)),
        fill(rect(50, 0, 40, 40), solid('#336699')),
        { ...fill(rect(0, 50, 40, 40), solid(INK)), mode: 'stroke', stroke: null },
        fill(rect(50, 50, 40, 40), solid(INK, 0.5)),
        text('Hallo', { paint: solid(INK) })
      )
    );
    const { pdf } = await write(scene, { cmyk });
    const content = pdf.content(0);
    expect(content.match(/^1 0\.6 0\.3 0\.4 k$/gm)).toHaveLength(3); // fill, fill with alpha, text
    expect(content).toContain('1 0.6 0.3 0.4 K');
    expect(content).toContain('0.2 0.4 0.6 rg');
    // The alpha of a mapped colour stays an ExtGState.
    expect(pdf.number(only(pdf.ofType('ExtGState')).dict, 'ca')).toBe(0.5);
    expect(content).not.toContain('0.0588 0.2275'); // the RGB of the mapped colour is nowhere
  });

  it('matches colours whatever the case of the key', async () => {
    const { pdf } = await write(sceneOf(item('a', null, fill(rect(0, 0, 9, 9), solid(INK)))), {
      cmyk: { '#0F3A52': [10, 20, 30, 40] },
    });
    expect(pdf.content(0)).toContain('0.1 0.2 0.3 0.4 k');
  });

  it('matches a key whatever its case, length or alpha digits', async () => {
    const scene = sceneOf(
      item(
        'a',
        null,
        fill(rect(0, 0, 9, 9), solid(INK)),
        fill(rect(0, 0, 9, 9), solid('#ffffff')),
        fill(rect(0, 0, 9, 9), solid('#112233')),
        fill(rect(0, 0, 9, 9), solid('#aabbcc'))
      )
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { pdf } = await write(scene, {
      cmyk: {
        '#0F3A52': [10, 20, 30, 40], // upper case
        '#fff': [0, 0, 0, 5], // short
        '#11223380': [1, 2, 3, 4], // alpha dropped
        '#ABCD': [50, 0, 0, 0], // short with alpha, dropped
      },
    });
    const content = pdf.content(0);
    expect(content).toContain('0.1 0.2 0.3 0.4 k');
    expect(content).toContain('0 0 0 0.05 k');
    expect(content).toContain('0.01 0.02 0.03 0.04 k');
    // `#ABCD` is `#AABBCC` with an alpha digit.
    expect(content).toContain('0.5 0 0 0 k');
    expect(content).not.toContain(' rg');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('normalises the brand palette too, so a short or upper-case colour is found', async () => {
    const scene = sceneOf(item('a', null, fill(rect(0, 0, 9, 9), solid('#ffffff'))));
    const { report } = await write(scene, { brandPalette: ['#FFF', 'not a colour'] });
    expect(report.rgbBrandColors).toEqual(['#ffffff']);
  });

  it('names the entries it cannot use in one warning, and leaves those colours RGB', async () => {
    const scene = sceneOf(
      item('a', null, fill(rect(0, 0, 9, 9), solid(INK)), fill(rect(0, 0, 9, 9), solid('#336699')))
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { pdf } = await write(scene, {
      cmyk: { blue: [100, 0, 0, 0], '#0f3a5': [1, 2, 3, 4], '#336699': [1, 2, 3] as never },
    });
    expect(pdf.content(0)).not.toMatch(/ [kK]\n/);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/blue, #0f3a5, #336699/);
    warn.mockRestore();
  });

  it('leaves out an entry that is not four numbers, and keeps values within 0..100', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = sceneOf(
      item(
        'a',
        null,
        fill(rect(0, 0, 9, 9), solid('#111111')),
        fill(rect(0, 0, 9, 9), solid('#222222'))
      )
    );
    const { pdf, report } = await write(scene, {
      cmyk: {
        '#111111': [10, 20, 30] as never, // three inks: no colour
        '#222222': [120, -5, 50, 0], // clamped
      },
      brandPalette: ['#111111'],
    });
    const content = pdf.content(0);
    expect(content).toContain('0.0667 0.0667 0.0667 rg');
    expect(content).toContain('1 0 0.5 0 k');
    expect(report.rgbBrandColors).toEqual(['#111111']);
    warn.mockRestore();
  });

  it('writes a pure RGB pdf without a map', async () => {
    const { pdf } = await write(sceneOf(item('a', null, fill(rect(0, 0, 9, 9), solid(INK)))));
    expect(pdf.content(0)).toContain(' rg');
    expect(pdf.content(0)).not.toMatch(/ [kK]\n/);
  });

  describe('gradients', () => {
    const gradient = (...entries: [number, string][]): Extract<Paint, { type: 'linear' }> => ({
      type: 'linear',
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 0,
      stops: stops(...entries),
    });
    const shadingOf = async (paint: Paint, map: WritePdfOptions['cmyk'] = {}) => {
      const { pdf } = await write(sceneOf(item('g', null, fill(rect(0, 0, 100, 10), paint))), {
        cmyk: map,
      });
      const pattern = only(pdf.objects.filter((o) => pdf.number(o.dict, 'PatternType') === 2));
      return { pdf, shading: pdf.dictAt(pattern.dict, 'Shading')! };
    };

    it('gradients with all stops mapped become DeviceCMYK shadings', async () => {
      const { pdf, shading } = await shadingOf(gradient([0, INK], [1, '#1a5c3a']), {
        ...cmyk,
        '#1a5c3a': [90, 10, 80, 20],
      });
      expect(pdf.name(shading, 'ColorSpace')).toBe('DeviceCMYK');
      const fn = pdf.dictAt(shading, 'Function')!;
      expect(pdf.numbers(fn, 'C0')).toEqual([1, 0.6, 0.3, 0.4]);
      expect(pdf.numbers(fn, 'C1')).toEqual([0.9, 0.1, 0.8, 0.2]);
    });

    it('keeps a gradient with a stop outside the map RGB', async () => {
      const { pdf, shading } = await shadingOf(gradient([0, INK], [1, '#336699']), cmyk);
      expect(pdf.name(shading, 'ColorSpace')).toBe('DeviceRGB');
      expect(pdf.numbers(pdf.dictAt(shading, 'Function')!, 'C1')).toHaveLength(3);
    });

    it('mapped stops with different alphas still fade through a gray soft mask', async () => {
      const fading: Paint = {
        ...gradient([0, INK], [1, INK]),
        stops: stops([0, INK, 1], [1, INK, 0]),
      };
      const { pdf } = await write(sceneOf(item('g', null, fill(rect(0, 0, 100, 10), fading))), {
        cmyk,
      });
      const shadings = pdf.objects.filter((o) => pdf.number(o.dict, 'ShadingType') !== null);
      expect(shadings.map((o) => pdf.name(o.dict, 'ColorSpace')).sort()).toEqual([
        'DeviceCMYK',
        'DeviceGray',
      ]);
    });
  });

  describe('report.rgbBrandColors', () => {
    const palette = [INK, '#336699', '#ABCDEF', '#00ff00', '#ff00ff'];

    it('report.rgbBrandColors lists palette colours written as RGB', async () => {
      const scene = sceneOf(
        item(
          'a',
          null,
          fill(rect(0, 0, 40, 40), solid(INK)), // mapped: CMYK
          fill(rect(50, 0, 40, 40), solid('#336699')), // RGB
          fill(rect(0, 50, 40, 40), solid('#336699')), // twice: listed once
          fill(rect(0, 0, 100, 10), {
            type: 'linear',
            x0: 0,
            y0: 0,
            x1: 100,
            y1: 0,
            stops: stops([0, INK], [1, '#abcdef']), // mixed: RGB, both stops
          }),
          fill(rect(0, 0, 9, 9), solid('#123456')) // RGB, but not a brand colour
        )
      );
      const { report } = await write(scene, { cmyk, brandPalette: palette });
      expect(report.rgbBrandColors).toEqual(['#0f3a52', '#336699', '#abcdef']);
    });

    it('lists nothing for a colour that is written as CMYK, or never drawn', async () => {
      const scene = sceneOf(item('a', null, fill(rect(0, 0, 40, 40), solid(INK))));
      const { report } = await write(scene, { cmyk, brandPalette: palette });
      expect(report.rgbBrandColors).toEqual([]);
    });

    it('lists the colours of a pack without a map: it is RGB all through', async () => {
      const scene = sceneOf(item('a', null, fill(rect(0, 0, 40, 40), solid(INK))));
      const { report } = await write(scene, { brandPalette: palette });
      expect(report.rgbBrandColors).toEqual([INK]);
    });

    it('does not list a colour whose op draws nothing', async () => {
      const nothing: ClipPath = { matrix: IDENTITY, commands: [], rule: 'nonzero' };
      const scene = sceneOf(
        item('a', null, fill(rect(0, 0, 40, 40), solid('#336699'), { clips: [nothing] }))
      );
      const { report } = await write(scene, { cmyk, brandPalette: palette });
      expect(report.rgbBrandColors).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------------------------

describe('document', () => {
  it('writes the same bytes for the same scene', async () => {
    const make = () => fixtureScene(png);
    const first = await write(make());
    const second = await write(make());
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
  });

  it('size budget: the fixture scene as pdf is under 200 KB without photos', async () => {
    const { bytes, report, pdf } = await write(fixtureScene(png));
    expect(bytes.length).toBeLessThan(200 * 1024);
    // Every kind of thing the fixture has is there, and what had to be a picture is named.
    expect(pdf.ofType('Type0').length).toBeGreaterThan(0);
    expect(report.rasterIslands.map((island) => island.reason).sort()).toEqual(
      expect.arrayContaining(['missing-glyph', 'shadow'])
    );
    expect(emptyReport().missingElements).toEqual([]);
    expect(report.missingElements).toEqual([]);
  });
});
