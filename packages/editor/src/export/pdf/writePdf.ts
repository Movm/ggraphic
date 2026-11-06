// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Writes resolved export scenes as a PDF with vector content: paths, real text in embedded subset
 * fonts, gradients, patterns, clips, alpha and images, with the pictures only a rasteriser can make
 * (blurred shadows, text no font covers, SVG it cannot convert) placed in between.
 *
 * `pdf-lib` and fontkit load here, by dynamic `import()`, and never with the module. The output
 * depends on nothing but the scenes and the options: same input, same bytes.
 *
 * Three page layouts, one page per scene:
 * - digital: 1 px = 1 pt.
 * - slides: `SLIDE_PDF_PAGE_PT`, the scene stretched onto it.
 * - print: the sheet of `pdfPageGeometry` (trim + bleed + the margin for crop marks); the scene,
 *   which covers trim + bleed, is placed on the bleed box and clipped to it, the boxes are set,
 *   and `cropMarkLines` are drawn in 100 % K.
 *
 * Colours: a solid paint (and a gradient of which every stop) in a colour of `options.cmyk` is
 * written as DeviceCMYK with the brand's exact values; everything else is RGB.
 */
import { loadFontkit } from '../fonts/glyphs.js';
import { cropMarkLines, MARK_STROKE_PT, pdfPageGeometry, type SizeMm } from '../printPdf.js';
import { emptyReport, mergeReports } from '../scene/types.js';
import { SLIDE_PDF_PAGE_PT } from '../slidesPdf.js';
import { mostUsedFont, svgDefaultsFor } from '../svg/svgImageScene.js';
import { ContentWriter, type PageEnv, type RasterizeOps } from './pdfContent.js';
import { fontkitForPdf } from './pdfFontkit.js';
import { matrixOperands, normalHex, num } from './pdfGeometry.js';
import { PageResources, PdfAssets, type Ink } from './pdfResources.js';

import type { FontFileSet } from '../fonts/fontFiles.js';
import type { BoxPt } from '../printPdf.js';
import type { ExportReport, ExportScene, FontSpec, Matrix } from '../scene/types.js';

/** `#rrggbb` (lower case) to the four ink values, 0..100. */
export type CmykMap = Readonly<Record<string, readonly [number, number, number, number]>>;

export interface WritePdfOptions {
  mode: 'digital' | 'slides' | 'print';
  /** Required for `print`: the scenes cover trim + bleed. */
  print?: { trimMm: SizeMm; bleedMm: number };
  /** The brand's print values; without it every colour is RGB. Keys are case-insensitive. */
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
  if (options.mode === 'print' && !options.print) {
    throw new Error('writePdf: the print mode needs the trim size and the bleed of the format');
  }
  const lib = await import('pdf-lib');
  const doc = await lib.PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkitForPdf(await loadFontkit()));
  if (options.title) doc.setTitle(options.title);

  const assets = new PdfAssets(lib, doc, inksOf(options.cmyk));
  const svgDefaults = svgDefaultsFor(options.fonts, options.defaultFont ?? mostUsedFont(pages));
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
    const layout = layoutOf(scene, options);
    const content = new ContentWriter(env, layout.matrix);
    if (layout.print) {
      // Crop marks outside the bleed box, then the scene inside it: art that hangs out of the
      // canvas must not reach the margin the marks stand in.
      content.raw('q');
      for (const line of layout.print.marks) content.raw(line);
      content.raw('Q');
      content.raw('q');
      content.raw(layout.print.clip);
    }
    // Content is page px with y down; one transform puts it on the page.
    content.raw(`${matrixOperands(layout.matrix)} cm`);
    for (const item of scene.items) {
      env.elementId = item.elementId;
      await content.ops(item.ops);
    }
    if (layout.print) content.raw('Q');

    const page = doc.addPage([layout.width, layout.height]);
    if (layout.print) {
      const { bleedBox, trimBox } = layout.print;
      page.setBleedBox(bleedBox.x, bleedBox.y, bleedBox.width, bleedBox.height);
      page.setTrimBox(trimBox.x, trimBox.y, trimBox.width, trimBox.height);
    }
    page.node.set(lib.PDFName.of('Resources'), resources.ref);
    page.node.set(
      lib.PDFName.of('Contents'),
      doc.context.register(doc.context.flateStream(content.text()))
    );
    report = mergeReports(mergeReports(report, scene.report), own);
  }

  // The brand colours that ended up RGB: all of them in a pack without a map, the unmapped ones
  // in a pack with one.
  const palette = new Set(
    (options.brandPalette ?? []).flatMap((colour) => normalHex(colour) ?? [])
  );
  report = mergeReports(report, {
    ...emptyReport(),
    rgbBrandColors: [...assets.rgbHexes].filter((hex) => palette.has(hex)),
  });
  report.rgbBrandColors.sort();

  // Object streams would hide the dictionaries from anyone who looks into the file.
  return { bytes: await doc.save({ useObjectStreams: false }), report };
}

// ---------------------------------------------------------------------------------------------
// Pages

interface PageLayout {
  /** The page in pt. */
  width: number;
  height: number;
  /** Scene px (y down) to page space (pt, y up). */
  matrix: Matrix;
  /** Print only: the boxes, the clip to the bleed box and the crop marks, as operators. */
  print: {
    bleedBox: BoxPt;
    trimBox: BoxPt;
    clip: string;
    marks: string[];
  } | null;
}

function layoutOf(scene: ExportScene, options: WritePdfOptions): PageLayout {
  if (options.mode === 'slides') {
    const { width, height } = SLIDE_PDF_PAGE_PT;
    return {
      width,
      height,
      matrix: [width / scene.width, 0, 0, -height / scene.height, 0, height],
      print: null,
    };
  }
  if (options.mode === 'print') {
    const { trimMm, bleedMm } = options.print!;
    const { mediaBox, bleedBox, trimBox } = pdfPageGeometry({ trimMm, bleedMm });
    return {
      width: mediaBox.width,
      height: mediaBox.height,
      matrix: [
        bleedBox.width / scene.width,
        0,
        0,
        -bleedBox.height / scene.height,
        bleedBox.x,
        bleedBox.y + bleedBox.height,
      ],
      print: {
        bleedBox,
        trimBox,
        clip: `${num(bleedBox.x)} ${num(bleedBox.y)} ${num(bleedBox.width)} ${num(bleedBox.height)} re W n`,
        // 100 % K: a registration colour, never mixed from the brand's inks.
        marks: [
          '0 0 0 1 K',
          `${num(MARK_STROKE_PT)} w`,
          ...cropMarkLines({ trimMm, bleedMm }).map(
            ({ start, end }) => `${num(start.x)} ${num(start.y)} m ${num(end.x)} ${num(end.y)} l S`
          ),
        ],
      },
    };
  }
  return {
    width: scene.width,
    height: scene.height,
    matrix: [1, 0, 0, -1, 0, scene.height],
    print: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Colour

/**
 * The map by lower-case `#rrggbb`, in 0..1 (`#FFF` and `#0F3A52` both match what a scene paints).
 * An entry whose key is no hex colour, or whose value is not four numbers, is left out: its colour
 * would silently stay RGB, so the entries are named in one warning.
 */
function inksOf(map: CmykMap | undefined): Map<string, Ink> {
  const inks = new Map<string, Ink>();
  const unusable: string[] = [];
  for (const [key, values] of Object.entries(map ?? {})) {
    const hex = normalHex(key);
    if (!hex || values.length !== 4 || !values.every(Number.isFinite)) {
      unusable.push(key);
      continue;
    }
    const [c, m, y, k] = values.map((value) => Math.min(100, Math.max(0, value)) / 100);
    inks.set(hex, [c!, m!, y!, k!]);
  }
  if (unusable.length > 0) {
    console.warn(
      `[writePdf] CMYK entries left out, those colours stay RGB: ${unusable.join(', ')}`
    );
  }
  return inks;
}
