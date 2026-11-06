// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Glyphs for the vector export: the fontkit boundary, the split of a text op into runs by the
 * font file that covers each code point, and glyph outlines as scene paths.
 */
import type * as FontkitModule from '@pdf-lib/fontkit';

import type { PathCommand } from '../scene/types.js';
import type { FontFile, FontFileSet } from './fontFiles.js';

/**
 * The part of a fontkit font the export reads. This is the boundary to an untyped module:
 * `@pdf-lib/fontkit` ships declarations, but they leave out `OS/2.fsType` (decoded into the flag
 * object below, not the number the spec names) and `path.commands`, and type `OS/2` as something
 * else. `parseFont` in `fontFiles.ts` is the one place that casts into this.
 */
export interface FontkitFont {
  postscriptName: string | null;
  unitsPerEm: number;
  /** Every code point the font's cmap maps to a glyph. */
  characterSet: readonly number[];
  /** The table is absent in fonts that never declare a licence flag. */
  'OS/2'?: { fsType?: FontkitFsType };
  hasGlyphForCodePoint(codePoint: number): boolean;
  /** One glyph for one code point, no shaping; code points outside the font give `.notdef`. */
  glyphForCodePoint(codePoint: number): FontkitGlyph;
  /** The shaped glyphs of a string, with the default features (what `pdf-lib` embeds). */
  layout(text: string): { glyphs: readonly FontkitGlyph[] };
}

/** What fontkit makes of `OS/2.fsType`: the bits it names (a number if a future version stops decoding them). */
export type FontkitFsType =
  | number
  | {
      noEmbedding?: boolean;
      viewOnly?: boolean;
      editable?: boolean;
      noSubsetting?: boolean;
      bitmapOnly?: boolean;
    };

export interface FontkitGlyph {
  advanceWidth: number;
  /** y up, in font units. */
  path: { commands: readonly FontkitPathSegment[] };
}

export interface FontkitPathSegment {
  command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath';
  args: readonly number[];
}

/**
 * fontkit is large; it loads when an export needs a font, never with the editor. The result is the
 * object `pdf-lib`'s `registerFontkit` takes.
 */
export async function loadFontkit(): Promise<typeof FontkitModule> {
  // Boundary cast: the module's default export is the object the shipped declarations describe
  // as the module namespace (`create`, ...), and the declarations do not list `default`.
  const module = (await import('@pdf-lib/fontkit')) as unknown as {
    default: typeof FontkitModule;
  };
  return module.default;
}

const shaped = new WeakMap<FontkitFont, Map<number, readonly FontkitGlyph[]>>();

/**
 * The glyphs a font draws for one code point on its own: what the browser shapes it to and what
 * `pdf-lib` embeds (it encodes text through `layout`), not the glyph the cmap names. They differ
 * in a font with required variation alternates: Fraunces Italic draws its 'w' with a glyph of 1491
 * units where the cmap one has 1644, and the x positions the browser measured are those of the
 * shaped glyph. Never empty.
 */
export function glyphsFor(font: FontkitFont, codePoint: number): readonly FontkitGlyph[] {
  let known = shaped.get(font);
  if (!known) shaped.set(font, (known = new Map()));
  let glyphs = known.get(codePoint);
  if (!glyphs) {
    const laidOut = font.layout(String.fromCodePoint(codePoint)).glyphs;
    glyphs = laidOut.length > 0 ? laidOut : [font.glyphForCodePoint(codePoint)];
    known.set(codePoint, glyphs);
  }
  return glyphs;
}

/** The advance of `codePoint` in font units: that of the glyphs `glyphsFor` gives, and so of the glyphs a PDF holds. */
export function advanceOf(font: FontkitFont, codePoint: number): number {
  return glyphsFor(font, codePoint).reduce((sum, glyph) => sum + glyph.advanceWidth, 0);
}

/** A stretch of a text op that one font file draws; `file` is null where no file has the glyphs. */
export interface GlyphRun {
  file: FontFile | null;
  text: string;
  /** One x per code point of `text`, the slice of the op's `xs`. */
  xs: number[];
}

/**
 * Cuts `text` into maximal runs of code points the same file covers, so a writer draws each run
 * with its own font and can report the runs nobody covers. `xs` has one entry per code point, as
 * in the scene's text ops.
 */
export function splitRuns(set: FontFileSet, text: string, xs: number[]): GlyphRun[] {
  const runs: GlyphRun[] = [];
  let index = 0;
  for (const char of text) {
    const file = set.fileFor(char.codePointAt(0) ?? 0);
    const x = xs[index++]!;
    const last = runs.at(-1);
    if (last && last.file === file) {
      last.text += char;
      last.xs.push(x);
    } else {
      runs.push({ file, text: char, xs: [x] });
    }
  }
  return runs;
}

/**
 * The outline of every code point of `text` in `file`, scaled to `size` px, y down, baseline at 0
 * and the pen at x = 0 (the writer moves each glyph to its own x). One entry per code point, in
 * the order of the op's `xs`, so a ligature is not formed and kerning is left to the positions
 * the browser measured. A glyph is the one the font shapes the code point to on its own (see
 * `glyphsFor`). A combining mark gets no base to attach to: precomposed text is exact.
 * A file with a `slant` (an upright cut standing in for an italic) is sheared about the baseline.
 */
export function glyphOutline(
  file: FontFile,
  text: string,
  size: number
): { advance: number; path: PathCommand[] }[] {
  const { font, slant } = file;
  const scale = size / font.unitsPerEm;
  // `0 - y` rather than `-y`: a flipped 0 must stay +0, or the output differs by a "-0".
  const x = (fx: number, fy: number) => (slant === 0 ? fx * scale : (fx + slant * fy) * scale);
  const y = (fy: number) => 0 - fy * scale;
  return Array.from(text, (char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    // A soft hyphen is not drawn by a canvas (it only shows at a line break) and is 0 wide.
    if (codePoint === 0xad) return { advance: 0, path: [] };
    // The shaped glyph, as the browser draws it; one that shapes into several (a decomposition)
    // keeps the glyph of the cmap, which has the whole character in one outline.
    const shapedGlyphs = glyphsFor(font, codePoint);
    const glyph = shapedGlyphs.length === 1 ? shapedGlyphs[0]! : font.glyphForCodePoint(codePoint);
    const path: PathCommand[] = glyph.path.commands.map((segment): PathCommand => {
      const a = segment.args;
      switch (segment.command) {
        case 'moveTo':
          return { op: 'M', x: x(a[0]!, a[1]!), y: y(a[1]!) };
        case 'lineTo':
          return { op: 'L', x: x(a[0]!, a[1]!), y: y(a[1]!) };
        case 'quadraticCurveTo':
          return {
            op: 'Q',
            x1: x(a[0]!, a[1]!),
            y1: y(a[1]!),
            x: x(a[2]!, a[3]!),
            y: y(a[3]!),
          };
        case 'bezierCurveTo':
          return {
            op: 'C',
            x1: x(a[0]!, a[1]!),
            y1: y(a[1]!),
            x2: x(a[2]!, a[3]!),
            y2: y(a[3]!),
            x: x(a[4]!, a[5]!),
            y: y(a[5]!),
          };
        case 'closePath':
          return { op: 'Z' };
      }
    });
    return { advance: glyph.advanceWidth * scale, path };
  });
}
