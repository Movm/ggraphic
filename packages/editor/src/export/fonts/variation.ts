// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The instance of a variable font for the weight a text asks for. A font file with a `wght` axis
 * draws its default instance when fontkit is not told otherwise (Bricolage Grotesque: ExtraBold),
 * so a regular text would come out bold, with the advances of a bold.
 *
 * `font.getVariation` makes the instance for a font file that is plain TrueType (TTF). It cannot
 * for a webfont: it re-reads the file as plain TrueType, which a WOFF is not and fails at the
 * first glyph (the probe in `makeInstance` catches that), and fontkit decodes the glyphs of a
 * WOFF2, which is what most webfonts are, in advance, with no variations applied. (Measured on 1.1.1: instancing it by hand gets the advances of the weight, from
 * `HVAR`, but the outlines of the default; that is worse than the default for both.) Such a font
 * stays at its default instance and is reported (`ExportReport.defaultInstanceFonts`).
 */
import type { FontkitFont } from './glyphs.js';

/**
 * `none`: the font as parsed is the one asked for (not variable, or the weight is the default).
 * `instance`: `font` is the instance for the weight. `default-only`: the font is variable and the
 * weight differs from its default, but no instance could be made; `font` is the default instance.
 */
export type Variation = 'none' | 'instance' | 'default-only';

const instances = new WeakMap<
  FontkitFont,
  Map<number, { font: FontkitFont; variation: Variation }>
>();

export function variationInstance(
  font: FontkitFont,
  weight: number
): { font: FontkitFont; variation: Variation } {
  const axes = font.variationAxes;
  const wght = axes?.['wght'];
  if (!axes || !wght) return { font, variation: 'none' };
  const asked = Math.min(Math.max(weight, wght.min), wght.max);
  if (asked === wght.default) return { font, variation: 'none' };

  let known = instances.get(font);
  if (!known) instances.set(font, (known = new Map()));
  let made = known.get(asked);
  if (!made) {
    const instance = makeInstance(font, axes, asked);
    made = instance
      ? { font: instance, variation: 'instance' }
      : { font, variation: 'default-only' };
    known.set(asked, made);
  }
  return made;
}

function makeInstance(
  font: FontkitFont,
  axes: NonNullable<FontkitFont['variationAxes']>,
  weight: number
): FontkitFont | null {
  const tables = font.directory?.tables;
  // Cubic outlines cannot be written into a PDF font program, see `pdfFontkit.ts`. A WOFF2
  // font's glyphs are decoded in advance, without the variations, so fontkit cannot instance it.
  if (!tables || tables.CFF2 || !tables.glyf || tables.glyf.transformed) return null;
  const settings = Object.fromEntries(
    Object.entries(axes).map(([tag, axis]) => [tag, tag === 'wght' ? weight : axis.default])
  );
  try {
    const instance = font.getVariation?.(settings);
    if (!instance) return null;
    // Draw one glyph: an instance that fontkit cannot decode fails here, not later in a writer.
    const [first] = instance.characterSet;
    if (first !== undefined) void instance.glyphForCodePoint(first).path.commands;
    return instance;
  } catch {
    return null;
  }
}
