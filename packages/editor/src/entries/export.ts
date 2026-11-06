// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Export: PPTX (fonts, model, writer), print and slide PDFs, SVG (recorder, resolver, writer, font
 * files), and zipped page images.
 */
export { pptxFamily, type PptxFontMapper, registerPptxFonts } from '../export/pptx/pptxFonts.js';
export { type PptxPageState } from '../export/pptx/buildPptxModel.js';
export { type PptxDeckModel, type PptxSlideModel, type PptxItem } from '../export/pptx/types.js';
export { writePptx, PPTX_MIME_TYPE } from '../export/pptx/writePptx.js';
export {
  exportPrintPdf,
  lowResolutionWarnings,
  type PrintExportPage,
  type PrintExportImage,
} from '../export/printExport.js';
export { exportSlidesPdf } from '../export/slidesPdf.js';
export {
  resolveFontFiles,
  type FontFile,
  type FontFileSet,
  type FontSourceDeps,
} from '../export/fonts/fontFiles.js';
export { fetchImageBytes, rasterizeOps, reencodeImage } from '../export/scene/browserDeps.js';
export { pngFromDataUrl } from '../export/scene/imageBytes.js';
export { recordPageScene, type RecordPageOptions } from '../export/scene/recordPageScene.js';
export { resolveScene, type ResolveDeps } from '../export/scene/resolveScene.js';
export {
  emptyReport,
  type ClipPath,
  type ColorStop,
  type ExportReport,
  type ExportScene,
  type FontSpec,
  type Matrix,
  type Paint,
  type PathCommand,
  type RasterReason,
  type RecordedScene,
  type SceneImageRef,
  type SceneImageSource,
  type SceneItem,
  type SceneOp,
  type Shadow,
  type StrokeStyle,
} from '../export/scene/types.js';
export { writeSvg, type WriteSvgOptions } from '../export/svg/writeSvg.js';
export {
  exportPagesPdf,
  exportPagesSvg,
  type PdfExportDeps,
  type PdfExportOptions,
  type VectorExportDeps,
  type VectorExportOptions,
  type VectorExportResult,
} from '../export/vectorExport.js';
export { zipPageImages } from '../utils/zipPageImages.js';
