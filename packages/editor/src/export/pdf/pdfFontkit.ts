// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The fontkit that `pdf-lib` embeds fonts with, repaired for WOFF2.
 *
 * `embedFont(bytes, { subset: true })` has fontkit cut a subset out of the font: for every glyph
 * it copies the glyph's bytes from the `glyf` table, found through `loca`. A WOFF2 file has no
 * such tables. Its `glyf` and `loca` are stored transformed, fontkit decodes the glyphs straight
 * from that form and never rebuilds the tables, so `font.loca` holds numbers that point nowhere
 * (measured on Instrument Sans: offsets that go backwards). The copy then reads other glyphs'
 * data and produces a font program whose glyphs are empty or damaged: the PDF is valid, the text
 * is invisible. Worse, a composite glyph (`"`, `:`, every accented capital) writes past the end of
 * its copy, in a timer callback, so the exception is not catchable and `save()` never settles.
 *
 * What does work in a WOFF2 font is `glyph.path`, which fontkit builds from the decoded glyphs and
 * which the SVG writer already draws. The subset of such a font is therefore made from the paths:
 * every glyph is written as a simple glyph (composites come out flattened) without instructions.
 * fontkit has an encoder for this (`encodeSimple`, made for variable fonts); it leaves out the
 * repeat count of a trailing run of equal flags, which makes the glyph unreadable, so the record is
 * written here. Other fonts (TrueType, OpenType, WOFF) keep fontkit's own copy, exact for them.
 *
 * This reaches into fontkit's private parts (`TtfSubset`), so `@pdf-lib/fontkit` is pinned to an
 * exact version in package.json (1.1.1): a bump is a decision, checked against `pdfFontkit.vitest.ts`,
 * whose first describe pins each of these, one test per member:
 *
 * - `font.directory.tables.glyf.transformed`  true for WOFF2 (the test for a repaired subset)
 * - `font.createSubset()`                      replaced, to patch the subset it returns
 * - `subset._addGlyph(id)`                     replaced by `addGlyphFromPath`
 * - `subset.font.getGlyph(id)`                 glyph advance and path
 * - `subset.glyphEncoder.encodeSimple(...)`    only to reach the glyph-record buffer class
 * - `subset.glyf`, `subset.loca.offsets`, `subset.hmtx.metrics`, `subset.offset`
 *                                              the tables `_addGlyph` appends to
 * - `<record>.constructor.from(bytes)`         makes a record of the class fontkit's stream takes
 */
import type { FontkitFont } from '../fonts/glyphs.js';
import type * as FontkitModule from '@pdf-lib/fontkit';
import type { PDFDocument } from 'pdf-lib';

/** What `registerFontkit` takes; pdf-lib does not export the name. */
type Fontkit = Parameters<PDFDocument['registerFontkit']>[0];

/** The private parts of fontkit's `TTFSubset` and of a font it made that this reaches into. */
interface TtfSubset {
  font: {
    getGlyph(id: number): {
      advanceWidth: number;
      path: { commands: readonly PathSegment[] };
    };
  };
  glyphEncoder: { encodeSimple(path: unknown, instructions: readonly number[]): object };
  glyf: object[];
  loca: { offsets: number[] };
  hmtx: { metrics: { advance: number; bearing: number }[] };
  offset: number;
  _addGlyph(id: number): number;
}

interface PathSegment {
  command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath';
  args: readonly number[];
}

interface WoffFont {
  directory?: { tables?: { glyf?: { transformed?: boolean } } };
  createSubset(): TtfSubset;
}

/** True for a font whose `glyf` is stored transformed, which is what WOFF2 does. */
function hasTransformedGlyf(font: object): font is WoffFont {
  return (font as WoffFont).directory?.tables?.glyf?.transformed === true;
}

// ---------------------------------------------------------------------------------------------
// The glyph record

interface Point {
  x: number;
  y: number;
  onCurve: boolean;
}

/** TrueType contours of a path: quadratic segments only, which is all a `glyf` table has. */
function contoursOf(commands: readonly PathSegment[]): Point[][] {
  const contours: Point[][] = [];
  let current: Point[] = [];
  const close = () => {
    const [first] = current;
    const last = current.at(-1);
    // A contour closes itself: a last point on the first one says nothing.
    if (
      first &&
      last &&
      current.length > 1 &&
      last.onCurve &&
      last.x === first.x &&
      last.y === first.y
    ) {
      current.pop();
    }
    if (current.length > 0) contours.push(current);
    current = [];
  };
  for (const { command, args } of commands) {
    switch (command) {
      case 'moveTo':
        close();
        current.push({ x: Math.round(args[0]!), y: Math.round(args[1]!), onCurve: true });
        break;
      case 'lineTo':
        current.push({ x: Math.round(args[0]!), y: Math.round(args[1]!), onCurve: true });
        break;
      case 'quadraticCurveTo':
        current.push(
          { x: Math.round(args[0]!), y: Math.round(args[1]!), onCurve: false },
          { x: Math.round(args[2]!), y: Math.round(args[3]!), onCurve: true }
        );
        break;
      case 'bezierCurveTo':
        throw new Error('a cubic outline cannot be written as a TrueType glyph');
      case 'closePath':
        close();
        break;
    }
  }
  close();
  return contours;
}

/** A coordinate as the flag bits and bytes of a `glyf` record: same as before, one byte, or two. */
function coordinate(delta: number, shortBit: number, sameBit: number, bytes: number[]): number {
  if (delta === 0) return sameBit;
  if (Math.abs(delta) <= 255) {
    bytes.push(Math.abs(delta));
    return shortBit | (delta > 0 ? sameBit : 0);
  }
  bytes.push((delta >> 8) & 255, delta & 255);
  return 0;
}

/** The simple glyph record of `glyf`, aligned to four bytes, and the glyph's left edge. */
export function encodeSimpleGlyph(commands: readonly PathSegment[]): {
  bytes: Uint8Array;
  xMin: number;
} {
  const contours = contoursOf(commands);
  const points = contours.flat();
  if (points.length === 0) return { bytes: new Uint8Array(0), xMin: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const out: number[] = [];
  const int16 = (value: number) => out.push((value >> 8) & 255, value & 255);

  const xMin = Math.min(...xs);
  int16(contours.length);
  int16(xMin);
  int16(Math.min(...ys));
  int16(Math.max(...xs));
  int16(Math.max(...ys));
  let end = -1;
  for (const contour of contours) int16((end += contour.length));
  int16(0); // no instructions

  const flags: number[] = [];
  const xBytes: number[] = [];
  const yBytes: number[] = [];
  let [x, y] = [0, 0];
  points.forEach((point, index) => {
    const flag =
      (point.onCurve ? 1 : 0) |
      coordinate(xs[index]! - x, 2, 16, xBytes) |
      coordinate(ys[index]! - y, 4, 32, yBytes);
    flags.push(flag);
    [x, y] = [xs[index]!, ys[index]!];
  });
  // Equal flags in a row: the flag with the repeat bit, then how many more.
  for (let i = 0; i < flags.length;) {
    let run = 1;
    while (i + run < flags.length && flags[i + run] === flags[i] && run < 256) run++;
    if (run > 1) out.push(flags[i]! | 8, run - 1);
    else out.push(flags[i]!);
    i += run;
  }
  out.push(...xBytes, ...yBytes);
  while (out.length % 4 !== 0) out.push(0);
  return { bytes: Uint8Array.from(out), xMin };
}

/** Makes the glyph record from the outline instead of copying bytes. */
function addGlyphFromPath(this: TtfSubset, id: number): number {
  const glyph = this.font.getGlyph(id);
  const { bytes, xMin } = encodeSimpleGlyph(glyph.path.commands);
  // fontkit's stream takes only the kind of buffer it has bundled, which a `Uint8Array` is not.
  // That class is reached through a buffer `encodeSimple` made (an empty glyph, which it can do).
  const sample = this.glyphEncoder.encodeSimple(
    { commands: [], bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } },
    []
  );
  const record = (sample.constructor as unknown as { from(bytes: Uint8Array): object }).from(bytes);
  this.glyf.push(record);
  this.loca.offsets.push(this.offset);
  // The left side bearing has to be the glyph's own left edge, or a rasteriser shifts the glyph.
  this.hmtx.metrics.push({ advance: glyph.advanceWidth, bearing: xMin });
  this.offset += bytes.length;
  return this.glyf.length - 1;
}

/** What `registerFontkit` takes: `create` as fontkit has it, with the WOFF2 subset repaired. */
export function fontkitForPdf(fontkit: typeof FontkitModule): Fontkit {
  return {
    create(bytes: Uint8Array) {
      // Boundary cast: fontkit's shipped declarations do not describe the font it returns.
      const font = fontkit.create(bytes) as unknown as FontkitFont;
      if (hasTransformedGlyf(font)) {
        const createSubset = font.createSubset.bind(font);
        font.createSubset = () => {
          const subset = createSubset();
          subset._addGlyph = addGlyphFromPath;
          return subset;
        };
      }
      return font as never;
    },
  };
}
