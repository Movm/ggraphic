// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the SVG and PDF exports (`VectorExportDeps`) need of an editor that is on screen: the
 * stage of each page to record and draw from, the browser's image reading and rasteriser, the
 * host's font service and the brand's fonts, and the resolution of the raster islands (a print
 * format asks for more than a screen does).
 *
 * One function for every host of the exports: the editor shell, and the render gate, which checks
 * what the shell would export. A copy of this wiring is a place the two can differ.
 */
import { isPrintFormat, type CanvasFormat } from '../formats/index.js';
import { printPixelRatio } from './printExport.js';
import { fetchImageBytes, rasterizeOps, reencodeImage } from './scene/browserDeps.js';
import { pngFromDataUrl } from './scene/imageBytes.js';
import type { VectorExportDeps } from './vectorExport.js';

import type { BrandPack } from '@ggraphic/core';
import type { GenericCanvasRef } from '../components/GenericCanvas.js';
import type { CanvasExportFontService } from '../hostServices.js';

/** The part of a page's mounted stage the exports use. */
export type VectorExportCanvas = Pick<
  GenericCanvasRef,
  'recordScene' | 'rasterizeElement' | 'rasterizeNode'
>;

export interface CreateVectorDepsOptions {
  /** The mounted stage of page `index` (0-based); none when that page is not mounted. */
  canvasOf: (index: number) => VectorExportCanvas | null | undefined;
  /** The host's font files (`services.exportFonts`), asked before the brand's. */
  exportFonts?: CanvasExportFontService | null;
  /** Its font faces and bold families find the font files. */
  brand: BrandPack;
  /** A print format sets the pixel ratio of the raster islands; any other, 2. */
  format: CanvasFormat;
}

export function createVectorDeps({
  canvasOf,
  exportFonts,
  brand,
  format,
}: CreateVectorDepsOptions): VectorExportDeps {
  return {
    recordPage: async (index, options) =>
      (await canvasOf(index)?.recordScene({ page: index + 1, ...options })) ?? null,
    resolveDeps: (index) => ({
      page: index + 1,
      fetchBytes: fetchImageBytes,
      reencode: reencodeImage,
      rasterizeElement: async (elementId, pixelRatio) => {
        const drawn = await canvasOf(index)?.rasterizeElement(elementId, pixelRatio);
        const png = drawn ? pngFromDataUrl(drawn.dataUrl) : null;
        return drawn && png ? { png, box: drawn.box } : null;
      },
      rasterizeNode: async (nodeRef, pixelRatio) =>
        (await canvasOf(index)?.rasterizeNode(nodeRef, pixelRatio)) ?? null,
      rasterizeOps,
      rasterPixelRatio: isPrintFormat(format) ? printPixelRatio(format) : 2,
    }),
    fontDeps: {
      ...(exportFonts ? { host: exportFonts } : {}),
      brandFaces: brand.fontFaces,
      ...(brand.fonts.boldFamilies ? { boldFamilies: brand.fonts.boldFamilies } : {}),
    },
  };
}
