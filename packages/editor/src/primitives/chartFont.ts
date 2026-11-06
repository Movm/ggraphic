// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The brand body font as CSS for a chart SVG.
 *
 * The chart is drawn as an image, and an SVG image cannot load web fonts: its labels fell back to
 * the system sans. So the font files travel inside the SVG, as `@font-face` rules with `data:`
 * URLs in a `<style>` element. The files come from the same resolver the vector export uses
 * (`resolveFontFiles`), so the canvas and an exported SVG draw the same face.
 */
import type { FontFile, FontSourceDeps } from '../export/fonts/fontFiles.js';

/** The body font a chart is drawn in: the family, and the rules that make an SVG image draw it. */
export interface ChartFont {
  family: string;
  /** `@font-face` rules with the files as data URLs; null = no file found, the SVG stays `sans-serif`. */
  css: string | null;
}

/** Tick and legend text is regular, value labels are bold. */
const WEIGHTS = [400, 700] as const;

/**
 * One build per family for the whole session: fonts do not change while the editor is open, and
 * every chart re-render (a few a second while someone types in the data table) would otherwise
 * read and encode the files again. A build that found nothing is dropped again, so a font that
 * was only late (a failed download) is tried the next time instead of being missing until reload.
 */
const builds = new Map<string, Promise<string | null>>();

export function chartFontCss(family: string, deps: FontSourceDeps): Promise<string | null> {
  const key = `${family}|${WEIGHTS.join(',')}`;
  let build = builds.get(key);
  if (!build) {
    const started = buildCss(family, deps);
    build = started;
    builds.set(key, started);
    void started.then((css) => {
      if (css === null && builds.get(key) === started) builds.delete(key);
    });
  }
  return build;
}

async function buildCss(family: string, deps: FontSourceDeps): Promise<string | null> {
  try {
    // Loaded on the first chart, like recharts: the resolver is not part of the editor core chunk.
    const { resolveFontFiles } = await import('../export/fonts/fontFiles.js');
    const sets = await Promise.all(
      WEIGHTS.map((weight) => resolveFontFiles({ family, weight, style: 'normal', size: 13 }, deps))
    );
    return fontFaceCss(
      family,
      sets.flatMap((set) => set.files.map((file) => ({ weight: set.face.weight, file })))
    );
  } catch {
    return null;
  }
}

/** `value` as a CSS string: quoted, with `"`, `\` and control characters escaped. */
export function cssString(value: string): string {
  const escaped = value.replace(
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is escaped
    /["\\\u0000-\u001f\u007f]/g,
    (char) =>
      char === '"' || char === '\\' ? `\\${char}` : `\\${char.charCodeAt(0).toString(16)} `
  );
  return `"${escaped}"`;
}

/** The `@font-face` rules for the files of `family`, or null if none may be written into an SVG. */
export function fontFaceCss(
  family: string,
  entries: readonly { weight: number; file: FontFile }[]
): string | null {
  // The same file serves both weights when the font is variable, or has no bold of its own.
  const faces: { file: FontFile; weights: number[] }[] = [];
  for (const { weight, file } of entries) {
    // A licence that keeps the font out of a file keeps it out of a data URL as well.
    if (file.embeddable !== 'yes') continue;
    const same = faces.find((face) => sameFile(face.file, file));
    if (same) same.weights.push(weight);
    else faces.push({ file, weights: [weight] });
  }
  const rules = faces.flatMap(({ file, weights }) => {
    const type = fontType(file.bytes);
    if (!type) return [];
    const declarations = [
      `font-family:${cssString(family)}`,
      'font-style:normal',
      `font-weight:${weightDescriptor(file, weights)}`,
      `src:url(data:${type.mime};base64,${toBase64(file.bytes)}) format('${type.format}')`,
    ];
    if (file.ranges) declarations.push(`unicode-range:${file.ranges.map(unicodeRange).join(',')}`);
    return [`@font-face{${declarations.join(';')}}`];
  });
  return rules.length > 0 ? rules.join('\n') : null;
}

function sameFile(a: FontFile, b: FontFile): boolean {
  if (a.bytes.length !== b.bytes.length) return false;
  if (JSON.stringify(a.ranges) !== JSON.stringify(b.ranges)) return false;
  return a.bytes.every((byte, i) => byte === b.bytes[i]);
}

/**
 * A variable font declares the range of its weight axis, so a bold label gets the real bold
 * instead of a slanted-on one. A static file declares the lightest weight it was asked for: when
 * it is the regular cut standing in for the bold, the browser thickens it itself.
 */
function weightDescriptor(file: FontFile, weights: readonly number[]): string {
  // Boundary cast: fontkit reads `variationAxes` on variable fonts; `FontkitFont` does not declare it.
  const axes = (file.font as { variationAxes?: Record<string, { min: number; max: number }> })
    .variationAxes;
  const wght = axes?.['wght'];
  return wght ? `${wght.min} ${wght.max}` : String(Math.min(...weights));
}

function unicodeRange([from, to]: readonly [number, number]): string {
  const hex = (n: number) => n.toString(16).toUpperCase();
  return from === to ? `U+${hex(from)}` : `U+${hex(from)}-${hex(to)}`;
}

/** What the first bytes say the file is; the stylesheet's `format()` hint can be wrong or missing. */
function fontType(bytes: Uint8Array): { mime: string; format: string } | null {
  const tag = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  switch (tag) {
    case 'wOF2':
      return { mime: 'font/woff2', format: 'woff2' };
    case 'wOFF':
      return { mime: 'font/woff', format: 'woff' };
    case 'OTTO':
      return { mime: 'font/otf', format: 'opentype' };
    case 'true':
    case '\u0000\u0001\u0000\u0000':
      return { mime: 'font/ttf', format: 'truetype' };
    default:
      return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
