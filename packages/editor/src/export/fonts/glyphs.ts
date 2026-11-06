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
  /** The table is absent in fonts that never declare a licence flag. */
  'OS/2'?: { fsType?: FontkitFsType };
  hasGlyphForCodePoint(codePoint: number): boolean;
  /** One glyph for one code point, no shaping; code points outside the font give `.notdef`. */
  glyphForCodePoint(codePoint: number): FontkitGlyph;
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
 * the browser measured. A combining mark gets no base to attach to: precomposed text is exact.
 */
export function glyphOutline(
  file: FontFile,
  text: string,
  size: number
): { advance: number; path: PathCommand[] }[] {
  const { font } = file;
  const scale = size / font.unitsPerEm;
  // `0 - y` rather than `-y`: a flipped 0 must stay +0, or the output differs by a "-0".
  const x = (v: number) => v * scale;
  const y = (v: number) => 0 - v * scale;
  return Array.from(text, (char) => {
    const glyph = font.glyphForCodePoint(char.codePointAt(0) ?? 0);
    const path: PathCommand[] = glyph.path.commands.map((segment): PathCommand => {
      const a = segment.args;
      switch (segment.command) {
        case 'moveTo':
          return { op: 'M', x: x(a[0]!), y: y(a[1]!) };
        case 'lineTo':
          return { op: 'L', x: x(a[0]!), y: y(a[1]!) };
        case 'quadraticCurveTo':
          return { op: 'Q', x1: x(a[0]!), y1: y(a[1]!), x: x(a[2]!), y: y(a[3]!) };
        case 'bezierCurveTo':
          return {
            op: 'C',
            x1: x(a[0]!),
            y1: y(a[1]!),
            x2: x(a[2]!),
            y2: y(a[3]!),
            x: x(a[4]!),
            y: y(a[5]!),
          };
        case 'closePath':
          return { op: 'Z' };
      }
    });
    return { advance: glyph.advanceWidth * scale, path };
  });
}
