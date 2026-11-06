// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The SVG download: each page is recorded from its mounted stage, resolved (images read, islands
 * drawn), written, and packed. One page is the SVG itself, several are a ZIP with one SVG each.
 *
 * Everything that needs a browser comes in through `VectorExportDeps`, so this file runs in node:
 * the editor wires the stage, the canvas and the host's font service in (`CanvasEditorShell`).
 *
 * Pages are one after the other, which keeps one scene in memory at a time and makes the report
 * list things in the order of the pages. Their numbers in the report are 1-based (`index + 1`),
 * the number the editor shows.
 */
import { messages } from '../i18n/catalogue.js';
import { zipFiles } from '../utils/zipPageImages.js';
import { resolveFontFiles, type FontFileSet, type FontSourceDeps } from './fonts/fontFiles.js';
import { resolveScene, type ResolveDeps } from './scene/resolveScene.js';
import {
  emptyReport,
  mergeReports,
  type ExportReport,
  type FontSpec,
  type RecordedScene,
  type SceneOp,
} from './scene/types.js';
import { writeSvg } from './svg/writeSvg.js';

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

function collectFaces(ops: readonly SceneOp[], into: Map<string, FontSpec>): void {
  for (const op of ops) {
    if (op.kind === 'text') {
      if (!into.has(faceKey(op.font))) into.set(faceKey(op.font), op.font);
    } else if (op.kind === 'group') {
      collectFaces(op.ops, into);
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
