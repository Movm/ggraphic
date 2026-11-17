// SPDX-License-Identifier: AGPL-3.0-only
// Generates packages/editor/src/templates/fontWidths.generated.ts: the widest advance of every
// code point the Studio's fonts (Raleway, Fraunces, Instrument Sans, Bricolage Grotesque, Anton) draw, per family and per
// weight class, read from the installed @fontsource WOFF files and the @font-face rules the
// Studio loads. A code point counts only when every face of the class has the glyph AND its
// CSS unicode-range admits it; the browser draws any other in a fallback font. The render gate measures text
// with it, so a width is never below what the font draws. No dependencies: WOFF 1 is zlib
// tables, and only cmap, head, hhea and hmtx are read.
//
//   node scripts/generate-font-widths.mjs          # write the file
//   node scripts/generate-font-widths.mjs --check  # exit 1 when it is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT = join(root, 'packages/editor/src/templates/fontWidths.generated.ts');

/** Family name as the editor spells it → @fontsource package. */
const FAMILIES = {
  Raleway: 'raleway',
  Fraunces: 'fraunces',
  'Instrument Sans': 'instrument-sans',
  'Bricolage Grotesque': 'bricolage-grotesque',
  Anton: 'anton',
};
/**
 * Weight class → the stylesheets the Studio loads for it (`apps/studio/src/fonts.ts`), both
 * styles: a text may be italic in either class, so a code point counts only when every face
 * of the class draws it.
 */
const UPRIGHT_AND_ITALIC = {
  regular: ['400.css', '400-italic.css'],
  bold: ['700.css', '700-italic.css'],
};
/**
 * One class per shipped weight, per family. `regular` is 400 and `bold` is 700; the others carry
 * their weight as the name. A weight without a class of its own measures with the next heavier
 * one (`templateGeometry.ts`), and Anton, with its single face, with that for every weight.
 * Bricolage Grotesque and Anton have no italic face: the browser slants the upright one, whose
 * advances are the same.
 */
const CLASSES = {
  Raleway: UPRIGHT_AND_ITALIC,
  Fraunces: UPRIGHT_AND_ITALIC,
  'Instrument Sans': UPRIGHT_AND_ITALIC,
  'Bricolage Grotesque': {
    regular: ['400.css'],
    500: ['500.css'],
    600: ['600.css'],
    bold: ['700.css'],
    800: ['800.css'],
  },
  Anton: { regular: ['400.css'] },
};

function tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOFF') throw new Error('not a WOFF 1 file');
  const out = {};
  for (let i = 0, n = buf.readUInt16BE(12); i < n; i++) {
    const at = 44 + i * 20;
    const [offset, comp, orig] = [at + 4, at + 8, at + 12].map((o) => buf.readUInt32BE(o));
    const raw = buf.subarray(offset, offset + comp);
    out[buf.toString('latin1', at, at + 4)] = comp < orig ? inflateSync(raw) : raw;
  }
  return out;
}

/** code point → glyph id, from every Unicode cmap subtable (formats 4 and 12). */
function cmap(table) {
  const map = new Map();
  for (let i = 0, n = table.readUInt16BE(2); i < n; i++) {
    const [platform, encoding] = [table.readUInt16BE(4 + i * 8), table.readUInt16BE(6 + i * 8)];
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    const at = table.readUInt32BE(8 + i * 8);
    const format = table.readUInt16BE(at);
    if (format === 12) {
      for (let g = 0, groups = table.readUInt32BE(at + 12); g < groups; g++) {
        const [start, end, glyph] = [0, 4, 8].map((o) => table.readUInt32BE(at + 16 + g * 12 + o));
        for (let cp = start; cp <= end; cp++) map.set(cp, glyph + cp - start);
      }
    } else if (format === 4) {
      const segs = table.readUInt16BE(at + 6) / 2;
      const ends = at + 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const [end, start, delta, range] = [
          table.readUInt16BE(ends + s * 2),
          table.readUInt16BE(starts + s * 2),
          table.readInt16BE(deltas + s * 2),
          table.readUInt16BE(ranges + s * 2),
        ];
        for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
          let glyph;
          if (range === 0) glyph = (cp + delta) & 0xffff;
          else {
            const g = table.readUInt16BE(ranges + s * 2 + range + (cp - start) * 2);
            glyph = g === 0 ? 0 : (g + delta) & 0xffff;
          }
          if (glyph !== 0) map.set(cp, glyph);
        }
      }
    }
  }
  return map;
}

/** code point → advance in 1/1000 em, rounded up. */
function advances(file) {
  const t = tables(readFileSync(file));
  const upem = t['head'].readUInt16BE(18);
  const metrics = t['hhea'].readUInt16BE(34);
  const advance = (glyph) => t['hmtx'].readUInt16BE(Math.min(glyph, metrics - 1) * 4);
  const out = new Map();
  for (const [cp, glyph] of cmap(t['cmap'])) {
    if (cp > 0x20 || cp === 0x20) out.set(cp, Math.ceil((advance(glyph) * 1000) / upem));
  }
  return out;
}

/** The `@font-face` blocks of a fontsource stylesheet: file and CSS unicode-range. */
function faces(css) {
  const out = [];
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const file = /url\(\.\/files\/([^)]+?)\.woff2\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    if (!file || !range) throw new Error('unexpected @font-face block');
    const ranges = range.split(',').map((r) => {
      const [from, to] = r.trim().replace(/^U\+/i, '').split('-');
      if (from.includes('?'))
        return [parseInt(from.replace(/\?/g, '0'), 16), parseInt(from.replace(/\?/g, 'f'), 16)];
      return [parseInt(from, 16), parseInt(to ?? from, 16)];
    });
    out.push({ file, ranges });
  }
  return out;
}

/** code point → widest advance a stylesheet's faces draw: in the glyphs AND in the unicode-range. */
function drawable(pkgDir, stylesheet) {
  const out = new Map();
  for (const { file, ranges } of faces(readFileSync(join(pkgDir, stylesheet), 'utf8'))) {
    for (const [cp, w] of advances(join(pkgDir, 'files', `${file}.woff`))) {
      if (!ranges.some(([from, to]) => cp >= from && cp <= to)) continue;
      out.set(cp, Math.max(out.get(cp) ?? 0, w));
    }
  }
  return out;
}

export function buildFontWidthsSource() {
  const require = createRequire(join(root, 'apps/studio/package.json'));
  const lines = [];
  for (const [family, pkg] of Object.entries(FAMILIES)) {
    const dir = dirname(require.resolve(`@fontsource/${pkg}/package.json`));
    for (const [cls, sheets] of Object.entries(CLASSES[family])) {
      const perStyle = sheets.map((sheet) => drawable(dir, sheet));
      const widest = new Map();
      for (const [cp, w] of perStyle[0]) {
        const others = perStyle.slice(1).map((m) => m.get(cp));
        if (others.some((o) => o === undefined)) continue;
        widest.set(cp, Math.max(w, ...others));
      }
      const entries = [...widest]
        .sort((a, b) => a[0] - b[0])
        .map(([cp, w]) => `${cp.toString(16)}:${w}`);
      lines.push(`  ${JSON.stringify(`${family}/${cls}`)}: '${entries.join(',')}',`);
    }
  }
  return `// SPDX-License-Identifier: AGPL-3.0-only
// GENERATED by scripts/generate-font-widths.mjs from the installed @fontsource files. Do not edit.
// "family/weight class" -> "codepoint(hex):widest advance in 1/1000 em", comma separated.
export const FONT_WIDTHS: Readonly<Record<string, string>> = {
${lines.join('\n')}
};
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = buildFontWidthsSource();
  if (process.argv.includes('--check')) {
    if (readFileSync(OUTPUT, 'utf8') !== source) {
      console.error(
        'fontWidths.generated.ts is out of date: run node scripts/generate-font-widths.mjs'
      );
      process.exit(1);
    }
  } else writeFileSync(OUTPUT, source);
}
