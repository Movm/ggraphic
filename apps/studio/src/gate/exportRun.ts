// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The render gate's stage 3, page side: the drawn page is exported as SVG (both text modes) and
 * PDF through the editor's own export functions, wired to the page's stage the way
 * `CanvasEditorShell` wires them, and every file is drawn again at the size of the page.
 *
 * The comparison with the canvas is the spec's (`e2e/exportGate.spec.ts`).
 */
import { type BrandPack } from '@ggraphic/core';
import { type GenericCanvasRef } from '@ggraphic/editor/canvas';
import {
  type ExportReport,
  exportPagesPdf,
  exportPagesSvg,
  fetchImageBytes,
  pngFromDataUrl,
  rasterizeOps,
  reencodeImage,
  type VectorExportDeps,
} from '@ggraphic/editor/export';
import { getCanvasFormatOrDefault, isPrintFormat, isSlideFormat } from '@ggraphic/editor/templates';

import { drawPdf, drawSvg, type Drawn } from './exportRaster';
import { GATE_EXPORT_MODES, type GateExport, type GateExportMode } from './result';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The page in px. */
interface PageSize {
  width: number;
  height: number;
}

interface Made {
  blob: Blob;
  report: ExportReport;
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('could not read the export'));
    reader.readAsDataURL(blob);
  });
}

/** What `CanvasEditorShell.vectorDeps` gives the export functions, for a page that is the only one. */
function vectorDeps(canvas: GenericCanvasRef, brand: BrandPack): VectorExportDeps {
  return {
    recordPage: async (index, options) =>
      index === 0 ? ((await canvas.recordScene({ page: 1, ...options })) ?? null) : null,
    resolveDeps: () => ({
      page: 1,
      fetchBytes: fetchImageBytes,
      reencode: reencodeImage,
      rasterizeElement: async (elementId, pixelRatio) => {
        const drawn = await canvas.rasterizeElement(elementId, pixelRatio);
        const png = drawn ? pngFromDataUrl(drawn.dataUrl) : null;
        return drawn && png ? { png, box: drawn.box } : null;
      },
      rasterizeNode: async (nodeRef, pixelRatio) =>
        (await canvas.rasterizeNode(nodeRef, pixelRatio)) ?? null,
      rasterizeOps,
      // Print formats are the only ones that ask for more; the gate draws none.
      rasterPixelRatio: 2,
    }),
    fontDeps: {
      brandFaces: brand.fontFaces,
      ...(brand.fonts.boldFamilies ? { boldFamilies: brand.fonts.boldFamilies } : {}),
    },
  };
}

async function make(
  mode: GateExportMode,
  canvas: GenericCanvasRef,
  brand: BrandPack,
  formatId: string
): Promise<Made> {
  const deps = vectorDeps(canvas, brand);
  if (mode !== 'pdf') {
    const { blob, report } = await exportPagesSvg(
      [0],
      {
        text: mode === 'svg-outlines' ? 'outlines' : 'editable',
        transparent: false,
        filenameBase: 'gate',
      },
      deps
    );
    return { blob, report };
  }
  const format = getCanvasFormatOrDefault(formatId);
  if (isPrintFormat(format)) throw new Error('the render gate draws no print format');
  // The reason the vector PDF was not made is logged by `exportPagesPdf`; the raster PDF that
  // would replace it is not what the gate is about, so it is a failure that carries the reason.
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
    warn(...args);
  };
  try {
    const { blob, report } = await exportPagesPdf(
      {
        mode: isSlideFormat(format) ? 'slides' : 'digital',
        format,
        brand,
        filenameBase: 'gate',
        pageCount: 1,
      },
      {
        ...deps,
        rasterFallback: () =>
          Promise.reject(new Error(warnings.at(-1) ?? 'the vector PDF was not made')),
      }
    );
    return { blob, report };
  } finally {
    console.warn = warn;
  }
}

async function draw(mode: GateExportMode, blob: Blob, page: PageSize): Promise<Drawn> {
  return mode === 'pdf'
    ? drawPdf(new Uint8Array(await blob.arrayBuffer()), page.width, page.height)
    : drawSvg(await blob.text(), page.width, page.height);
}

export interface ExportRun {
  page: PageSize;
  /** The stage as a PNG data URL, page px, no placeholders: what the canvas looks like as an export. */
  exportPng: string;
  images: { pending: number; failed: number };
  exports: GateExport[];
}

/**
 * Exports the drawn page in each of `modes` and draws the files. A mode that fails is reported on
 * its own entry; the run itself throws only when the canvas cannot be read at all.
 */
export async function runExports(
  canvas: GenericCanvasRef,
  brand: BrandPack,
  formatId: string,
  modes: readonly GateExportMode[]
): Promise<ExportRun> {
  const format = getCanvasFormatOrDefault(formatId);
  // A page whose images are still loading would be compared with an export that lacks them; the
  // spec says so rather than this run, so the pixels of the other pages are still measured.
  const images = canvas.imageLoadState();
  const exportPng = await canvas.captureCanvas({ format: 'png', pixelRatio: 1 });
  if (!exportPng) throw new Error('the stage gave no image');
  const page = { width: format.width, height: format.height };

  const exports: GateExport[] = [];
  for (const mode of GATE_EXPORT_MODES.filter((m) => modes.includes(m))) {
    const result: GateExport = {
      mode,
      exported: null,
      exportedPng: null,
      size: null,
      report: null,
      error: null,
    };
    exports.push(result);
    try {
      const made = await make(mode, canvas, brand, formatId);
      result.report = made.report;
      result.exported = await blobDataUrl(made.blob);
      const drawn = await draw(mode, made.blob, page);
      result.exportedPng = drawn.png;
      result.size = drawn.natural;
    } catch (error) {
      result.error = message(error);
    }
  }
  return { page, exportPng, images, exports };
}
