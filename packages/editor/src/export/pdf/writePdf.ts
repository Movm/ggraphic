// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Writes resolved export scenes as a PDF with vector content: paths, real text in embedded subset
 * fonts, gradients, patterns, clips, alpha and images, with the pictures only a rasteriser can make
 * (blurred shadows, text no font covers, SVG it cannot convert) placed in between.
 *
 * `pdf-lib` and fontkit load here, by dynamic `import()`, and never with the module. The output
 * depends on nothing but the scenes and the options: same input, same bytes.
 *
 * This is the digital mode: one page per scene, 1 px = 1 pt. Slides and print pages, and CMYK, come
 * with their own tasks; `mode`, `print`, `cmyk` and `brandPalette` are in the options for them and
 * are not read yet.
 */
import { loadFontkit } from '../fonts/glyphs.js';
import { emptyReport, mergeReports } from '../scene/types.js';
import { ContentWriter, type PageEnv, type RasterizeOps } from './pdfContent.js';
import { fontkitForPdf } from './pdfFontkit.js';
import { PageResources, PdfAssets } from './pdfResources.js';

import type { SizeMm } from '../printPdf.js';
import type { FontFileSet } from '../fonts/fontFiles.js';
import type { ExportReport, ExportScene, FontSpec, Matrix, SceneOp } from '../scene/types.js';

/** `#rrggbb` (lower case) to the four ink values, 0..100. */
export type CmykMap = Readonly<Record<string, readonly [number, number, number, number]>>;

export interface WritePdfOptions {
  mode: 'digital' | 'slides' | 'print';
  /** Required for `print`. */
  print?: { trimMm: SizeMm; bleedMm: number };
  cmyk?: CmykMap;
  /** The brand colours (hex), for `report.rgbBrandColors`. */
  brandPalette?: readonly string[];
  /** The files of every face the scenes draw text in, by `${family}|${weight}|${style}`. */
  fonts: ReadonlyMap<string, FontFileSet>;
  title?: string;
  /** Draws ops (page px, each with its own state) in a box of the page; see `rebaseOps`. */
  rasterize: RasterizeOps;
  /** Pixels of a raster island per page px. */
  rasterPixelRatio: number;
  /**
   * The font an SVG image inherits where it names none (chart labels). Default: the family drawn
   * most often in the scenes' own text.
   */
  defaultFont?: FontSpec;
}

export async function writePdf(
  pages: readonly ExportScene[],
  options: WritePdfOptions
): Promise<{ bytes: Uint8Array; report: ExportReport }> {
  if (options.mode !== 'digital') {
    throw new Error(`writePdf: the ${options.mode} mode is not written yet`);
  }
  const lib = await import('pdf-lib');
  const doc = await lib.PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkitForPdf(await loadFontkit()));
  if (options.title) doc.setTitle(options.title);

  const assets = new PdfAssets(lib, doc);
  const svgDefaults = {
    font: options.defaultFont ?? mostUsedFont(pages),
    measure: (text: string, font: FontSpec) => measure(options.fonts, text, font),
  };
  let report = emptyReport();

  for (const [index, scene] of pages.entries()) {
    const own = emptyReport();
    const resources = new PageResources(assets);
    const env: PageEnv = {
      assets,
      resources,
      page: index + 1,
      width: scene.width,
      height: scene.height,
      fonts: options.fonts,
      report: own,
      rasterize: options.rasterize,
      pixelRatio: options.rasterPixelRatio,
      svgDefaults,
      elementId: null,
    };
    // Content is page px with y down; one flip puts it on the page.
    const flip: Matrix = [1, 0, 0, -1, 0, scene.height];
    const content = new ContentWriter(env, flip);
    content.raw(`1 0 0 -1 0 ${scene.height} cm`);
    for (const item of scene.items) {
      env.elementId = item.elementId;
      await content.ops(item.ops);
    }

    const page = doc.addPage([scene.width, scene.height]);
    page.node.set(lib.PDFName.of('Resources'), resources.ref);
    page.node.set(
      lib.PDFName.of('Contents'),
      doc.context.register(doc.context.flateStream(content.text()))
    );
    report = mergeReports(mergeReports(report, scene.report), own);
  }

  // Object streams would hide the dictionaries from anyone who looks into the file.
  return { bytes: await doc.save({ useObjectStreams: false }), report };
}

// ---------------------------------------------------------------------------------------------
// SVG text

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
function mostUsedFont(pages: readonly ExportScene[]): FontSpec {
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
 * text by it, and the PDF then sets the glyphs at those places. A code point no file has gets
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
