// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The SVG and PDF downloads: each page is recorded from its mounted stage, resolved (images read,
 * islands drawn), written, and packed. One SVG page is the SVG itself, several are a ZIP with one
 * SVG each; a PDF holds all the pages.
 *
 * Everything that needs a browser comes in through `VectorExportDeps`, so this file runs in node:
 * the editor wires the stage, the canvas and the host's font service in (`CanvasEditorShell`).
 *
 * Pages are one after the other, which keeps one scene in memory at a time (the PDF writer takes
 * all of them at once) and makes the report list things in the order of the pages. Their numbers
 * in the report are 1-based (`index + 1`), the number the editor shows.
 */
import { isPrintFormat, type CanvasFormat } from '../formats/index.js';
import { messages } from '../i18n/catalogue.js';
import { zipFiles } from '../utils/zipPageImages.js';
import { resolveFontFiles, type FontFileSet, type FontSourceDeps } from './fonts/fontFiles.js';
import { writePdf } from './pdf/writePdf.js';
import { IDENTITY } from './scene/matrix.js';
import { fontFamilies } from './scene/recordingContext.js';
import { resolveScene, type ResolveDeps } from './scene/resolveScene.js';
import {
  emptyReport,
  mergeReports,
  type ExportReport,
  type FontSpec,
  type RasterReason,
  type RecordedScene,
  type SceneOp,
} from './scene/types.js';
import { svgToScene } from './svg/svgToScene.js';
import { writeSvg } from './svg/writeSvg.js';

import type { BrandPack } from '@ggraphic/core';

export interface VectorExportDeps {
  /** The page as the stage draws it now, or null when it is not mounted. */
  recordPage: (index: number, options: { transparent: boolean }) => Promise<RecordedScene | null>;
  /** What `resolveScene` needs of page `index`; its `page` is replaced by the page's number. */
  resolveDeps: (index: number) => ResolveDeps;
  fontDeps: FontSourceDeps;
}

export interface VectorExportOptions {
  /** `outlines`: glyph outlines, no font needed to open the file. `editable`: `<text>`. */
  text: 'outlines' | 'editable';
  /** No page background. */
  transparent: boolean;
  /** The file name without its extension. */
  filenameBase: string;
}

export interface VectorExportResult {
  blob: Blob;
  filename: string;
  report: ExportReport;
}

export async function exportPagesSvg(
  pageIndexes: readonly number[],
  options: VectorExportOptions,
  deps: VectorExportDeps
): Promise<VectorExportResult> {
  // One cache for the export: a face used on several pages is read once.
  const fontDeps: FontSourceDeps = { ...deps.fontDeps, cache: deps.fontDeps.cache ?? new Map() };
  const files: { name: string; svg: string }[] = [];
  let report = emptyReport();

  for (const index of pageIndexes) {
    const page = index + 1;
    const recorded = await deps.recordPage(index, { transparent: options.transparent });
    if (!recorded) throw new Error(messages().errors.pageExport(page));
    const scene = await resolveScene(recorded, { ...deps.resolveDeps(index), page });
    const fonts = options.text === 'outlines' ? await fontsOf(scene, fontDeps) : new Map();
    // The scene's report is the one the writer adds to (a run no font covers).
    const svg = writeSvg(scene, { text: options.text, fonts, report: scene.report, page });
    report = mergeReports(report, scene.report);
    files.push({ name: `${options.filenameBase}-${page}.svg`, svg });
  }

  const [only] = files;
  if (files.length === 1 && only) {
    return {
      blob: new Blob([only.svg], { type: 'image/svg+xml' }),
      filename: `${options.filenameBase}.svg`,
      report,
    };
  }
  const encoder = new TextEncoder();
  return {
    blob: zipFiles(files.map(({ name, svg }) => ({ name, bytes: encoder.encode(svg) }))),
    filename: `${options.filenameBase}.zip`,
    report,
  };
}

// ---------------------------------------------------------------------------------------------
// Fonts

/** The key `writeSvg` looks a face up by. */
const faceKey = (font: FontSpec) => `${font.family}|${font.weight}|${font.style}`;

function collectFaces(
  ops: readonly SceneOp[],
  into: Map<string, FontSpec>,
  /** More ops an op stands for, whose text needs a face too. */
  expand?: (op: SceneOp) => readonly SceneOp[]
): void {
  for (const op of ops) {
    if (op.kind === 'text') {
      if (!into.has(faceKey(op.font))) into.set(faceKey(op.font), op.font);
    } else if (op.kind === 'group') {
      collectFaces(op.ops, into, expand);
    } else if (expand) {
      collectFaces(expand(op), into, expand);
    }
  }
}

/** The files of every face the page draws text in. A face no source has comes out with no files. */
async function fontsOf(
  scene: RecordedScene,
  deps: FontSourceDeps
): Promise<Map<string, FontFileSet>> {
  const faces = new Map<string, FontSpec>();
  for (const item of scene.items) collectFaces(item.ops, faces);
  const fonts = new Map<string, FontFileSet>();
  for (const [key, face] of faces) fonts.set(key, await resolveFontFiles(face, deps));
  return fonts;
}

// ---------------------------------------------------------------------------------------------
// PDF

/**
 * The longest the PDF writer may take. A font that fontkit cannot subset can fail inside a timer
 * callback, where nothing can catch it, and the write then never settles: the export would hang.
 * Past this the raster PDF is made instead.
 */
export const PDF_WRITE_TIMEOUT_MS = 60_000;

export interface PdfExportOptions {
  /** `print` pages are trim + bleed with crop marks, `slides` fill a slide, `digital` are 1 pt to the px. */
  mode: 'digital' | 'slides' | 'print';
  /** Print mode takes the trim size and the bleed from it. */
  format: CanvasFormat;
  /** Its print values (`brand.print`) make the CMYK colours; its palette is what `report.rgbBrandColors` checks. */
  brand: BrandPack;
  /** The file name without its extension. */
  filenameBase: string;
  /** How many pages the document has: a PDF holds all of them. */
  pageCount: number;
  /** Default `PDF_WRITE_TIMEOUT_MS`. */
  writeTimeoutMs?: number;
}

export interface PdfExportDeps extends VectorExportDeps {
  /**
   * The PDF of page pictures this export replaces, for when the vector PDF cannot be made. If it
   * fails too, so does the export.
   */
  rasterFallback: () => Promise<Uint8Array>;
}

/**
 * Raster reasons that mean a font could not be used, as opposed to the legitimate islands (a
 * photo with a filter, a shadow, a glyph this one font lacks).
 */
const FONT_FAILURES: ReadonlySet<RasterReason> = new Set(['font-unavailable', 'bitmap-only-font']);

/** The elements (of all pages) whose text a font failure turned into a picture. */
function fontFailureCount(report: ExportReport): number {
  return new Set(
    report.rasterIslands
      .filter((island) => FONT_FAILURES.has(island.reason))
      .map((island) => `${island.page}:${island.elementId ?? ''}`)
  ).size;
}

/**
 * The PDF of the document: vector, in the mode of its format. It falls back to the raster PDF for
 * the whole document when the vector one cannot be made: the writer throws or does not finish in
 * time, or fonts failed for the text of more than one element (a picture of one element is a
 * normal island, of several it is a PDF nobody asked for). `report.fallback` then says why.
 */
export async function exportPagesPdf(
  options: PdfExportOptions,
  deps: PdfExportDeps
): Promise<VectorExportResult> {
  // A mistake of the caller, not something a raster PDF could make up for.
  if (options.mode === 'print' && !isPrintFormat(options.format)) {
    throw new Error('exportPagesPdf: the print mode needs a print format');
  }
  const filename = `${options.filenameBase}.pdf`;
  let reason: string;
  try {
    const { bytes, report } = await writeVectorPdf(options, deps);
    const failures = fontFailureCount(report);
    if (failures <= 1) return { blob: pdfBlob(bytes), filename, report };
    reason = `fonts could not be used for the text of ${failures} elements`;
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  console.warn(`[exportPagesPdf] vector PDF not made, writing the raster PDF instead: ${reason}`);
  const bytes = await deps.rasterFallback();
  return { blob: pdfBlob(bytes), filename, report: { ...emptyReport(), fallback: { reason } } };
}

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });

async function writeVectorPdf(options: PdfExportOptions, deps: PdfExportDeps) {
  const { brand, format } = options;
  const fontDeps: FontSourceDeps = { ...deps.fontDeps, cache: deps.fontDeps.cache ?? new Map() };

  const scenes: RecordedScene[] = [];
  for (let index = 0; index < options.pageCount; index++) {
    const page = index + 1;
    const recorded = await deps.recordPage(index, { transparent: false });
    if (!recorded) throw new Error(messages().errors.pageExport(page));
    scenes.push(await resolveScene(recorded, { ...deps.resolveDeps(index), page }));
  }

  // What an SVG's text inherits where it names no family (a chart's labels): the body font.
  const defaultFont = bodyFont(brand);
  const fonts = await pdfFontsOf(scenes, defaultFont, fontDeps);
  // Islands do not depend on the page they are on: the first page's rasteriser draws them all.
  const shared = deps.resolveDeps(0);
  const trim = isPrintFormat(format) ? format.print.trimMm : null;

  return withTimeout(
    writePdf(scenes, {
      mode: options.mode,
      ...(trim && {
        print: { trimMm: { width: trim.w, height: trim.h }, bleedMm: format.print!.bleedMm },
      }),
      ...(brand.print?.cmyk && { cmyk: brand.print.cmyk }),
      brandPalette: brandHexes(brand),
      fonts,
      rasterize: shared.rasterizeOps,
      rasterPixelRatio: shared.rasterPixelRatio,
      defaultFont,
    }),
    options.writeTimeoutMs ?? PDF_WRITE_TIMEOUT_MS
  );
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`the PDF writer did not finish within ${ms / 1000} s`)),
      ms
    );
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

/** The body font of the brand as the default of an SVG's text: regular, upright, 16 px. */
function bodyFont(brand: BrandPack): FontSpec {
  const [family, ...fallback] = fontFamilies(brand.fonts.body);
  return {
    family: family ?? 'sans-serif',
    ...(fallback.length > 0 && { fallback }),
    weight: 400,
    style: 'normal',
    size: 16,
  };
}

/**
 * The files of every face the pages' text is drawn in: the scenes' own text, the text inside their
 * SVG images (found by converting them, which is what the writer does too, so the faces match
 * exactly), and the default font.
 */
async function pdfFontsOf(
  scenes: readonly RecordedScene[],
  defaultFont: FontSpec,
  deps: FontSourceDeps
): Promise<Map<string, FontFileSet>> {
  const faces = new Map<string, FontSpec>([[faceKey(defaultFont), defaultFont]]);
  const converted = new Map<string, readonly SceneOp[]>();
  const textOfSvg = (op: SceneOp): readonly SceneOp[] => {
    if (op.kind !== 'image' || op.image.kind !== 'svg') return [];
    const { markup, width, height } = op.image;
    let ops = converted.get(markup);
    if (!ops) {
      ops = svgToScene(markup, { matrix: IDENTITY, width, height }, { font: defaultFont }).ops;
      converted.set(markup, ops);
    }
    return ops;
  };
  for (const scene of scenes) {
    for (const item of scene.items) collectFaces(item.ops, faces, textOfSvg);
  }
  const fonts = new Map<string, FontFileSet>();
  for (const [key, face] of faces) fonts.set(key, await resolveFontFiles(face, deps));
  return fonts;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Every colour of the brand pack that is a `#rrggbb`: its roles, palettes, grounds and glows. */
function brandHexes(brand: BrandPack): string[] {
  const colours = [
    ...Object.values(brand.colors),
    ...brand.palette.map((swatch) => swatch.color),
    ...brand.textPalette.map((swatch) => swatch.color),
    ...brand.backgrounds.flatMap((ground) => [ground.color, ...(ground.glow ?? [])]),
  ];
  return [...new Set(colours.filter((colour) => HEX.test(colour)).map((c) => c.toLowerCase()))];
}
