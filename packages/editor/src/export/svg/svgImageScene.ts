// SPDX-License-Identifier: AGPL-3.0-only
/**
 * An SVG image op as scene ops, for the writers that draw an SVG picture's shapes and text
 * themselves rather than embedding the picture: the PDF writer always, the SVG writer for a
 * picture with text of its own in outline mode (a chart), so that text is outlined like the
 * page's own and no font travels in the file.
 *
 * - `svgImageGroup` puts `svgToScene`'s ops where the canvas would have drawn the picture: at its
 *   natural size, stretched onto the destination rect by the matrix, cropped by a clip, with the
 *   image op's alpha and clips.
 * - `svgDefaultsFor` and `mostUsedFont` say what the picture's text inherits where it names no
 *   family, and how wide its glyphs are, from the font files the export resolved.
 */
import { IDENTITY, multiply } from '../scene/matrix.js';
import { svgToScene, type SvgToSceneDefaults } from './svgToScene.js';
import { formatNumber } from './xml.js';

import type { FontFileSet } from '../fonts/fontFiles.js';
import type { ClipPath, ExportScene, FontSpec, SceneImageSource, SceneOp } from '../scene/types.js';

type ImageOp = Extract<SceneOp, { kind: 'image' }>;
type GroupOp = Extract<SceneOp, { kind: 'group' }>;
export type SvgSource = Extract<SceneImageSource, { kind: 'svg' }>;

/**
 * Whether the markup has an element named `text` (with or without a namespace prefix): the only
 * thing an SVG can set text with. Text in a picture is the one thing a writer outlines or embeds
 * a font for, so a picture without any needs none of what follows.
 */
export function svgHasText(markup: string): boolean {
  return /<(?:[\w-]+:)?text[\s/>]/i.test(markup);
}

/**
 * The picture of `op` as the ops `svgToScene` makes of it, in one group. `outerClips` are the
 * clips the group stands in: the image op's own for a writer that opens the group like any other
 * op (the PDF writer), none for one that has put them around the op already (the SVG writer). The
 * crop is added to them when the source rect is not the whole picture. The group carries the op's
 * alpha and no shadow, which is the caller's to make for the image op.
 *
 * `unsupported` is not empty when the picture uses what the converter cannot reproduce; the ops
 * are then best effort and the caller draws the picture another way.
 */
export function svgImageGroup(
  op: ImageOp,
  source: SvgSource,
  defaults: SvgToSceneDefaults,
  outerClips: readonly ClipPath[]
): { group: GroupOp; unsupported: string[] } {
  const kx = op.dw / op.sw;
  const ky = op.dh / op.sh;
  // The picture at its natural size, stretched onto the destination rect; a crop is a clip.
  const matrix = multiply(
    op.matrix,
    multiply(
      [1, 0, 0, 1, op.dx, op.dy],
      multiply([kx, 0, 0, ky, 0, 0], [1, 0, 0, 1, -op.sx, -op.sy])
    )
  );
  const { ops, unsupported } = svgToScene(
    source.markup,
    { matrix, width: source.width, height: source.height },
    defaults
  );
  const whole =
    formatNumber(op.sx) === '0' &&
    formatNumber(op.sy) === '0' &&
    formatNumber(op.sw) === formatNumber(source.width) &&
    formatNumber(op.sh) === formatNumber(source.height);
  const crop: ClipPath = {
    matrix: op.matrix,
    commands: [
      { op: 'M', x: op.dx, y: op.dy },
      { op: 'L', x: op.dx + op.dw, y: op.dy },
      { op: 'L', x: op.dx + op.dw, y: op.dy + op.dh },
      { op: 'L', x: op.dx, y: op.dy + op.dh },
      { op: 'Z' },
    ],
    rule: 'nonzero',
  };
  return {
    group: {
      kind: 'group',
      matrix: IDENTITY,
      alpha: op.alpha,
      clips: whole ? outerClips : [...outerClips, crop],
      shadow: null,
      ops,
    },
    unsupported,
  };
}

// ---------------------------------------------------------------------------------------------
// What the picture's text inherits

const faceKey = (font: FontSpec) => `${font.family}|${font.weight}|${font.style}`;

function* textFonts(ops: readonly SceneOp[]): Generator<FontSpec> {
  for (const op of ops) {
    if (op.kind === 'text') yield op.font;
    else if (op.kind === 'group') yield* textFonts(op.ops);
  }
}

/**
 * What an SVG's text inherits where it names nothing: the family (and its fallbacks) the scenes
 * draw most text in, at the default weight and size. Charts say `sans-serif`, which means "the
 * document's font" here.
 */
export function mostUsedFont(pages: readonly ExportScene[]): FontSpec {
  const counts = new Map<string, { font: FontSpec; count: number }>();
  for (const scene of pages) {
    for (const item of scene.items) {
      for (const font of textFonts(item.ops)) {
        const known = counts.get(font.family);
        if (known) known.count++;
        else counts.set(font.family, { font, count: 1 });
      }
    }
  }
  let best: { font: FontSpec; count: number } | null = null;
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
  return {
    family: best?.font.family ?? 'sans-serif',
    ...(best?.font.fallback && { fallback: best.font.fallback }),
    weight: 400,
    style: 'normal',
    size: 16,
  };
}

/**
 * The advance of every code point of `text`, from the font files, in px: svgToScene places SVG
 * text by it, and the writer then sets the glyphs at those places. A code point no file has gets
 * 0.6 em, the converter's own guess.
 */
function measure(fonts: ReadonlyMap<string, FontFileSet>, text: string, font: FontSpec): number[] {
  const set = fonts.get(faceKey(font));
  return Array.from(text, (char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    const file = set?.fileFor(codePoint);
    return file
      ? (file.font.glyphForCodePoint(codePoint).advanceWidth * font.size) / file.font.unitsPerEm
      : font.size * 0.6;
  });
}

/** `svgToScene`'s defaults for a picture drawn with `fonts`, inheriting `font`. */
export function svgDefaultsFor(
  fonts: ReadonlyMap<string, FontFileSet>,
  font: FontSpec
): SvgToSceneDefaults {
  return { font, measure: (text, face) => measure(fonts, text, face) };
}
