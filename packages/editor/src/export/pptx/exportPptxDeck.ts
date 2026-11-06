// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Browser-Seite des PPTX-Exports: Seitenzustände → Modell → Datei. Texte
 * werden mit derselben Messung wie auf dem Canvas vermessen, Raster-Anfragen
 * gehen an das Stage der jeweiligen Seite (als SVG, wo die Aufnahme ganz Vektor ist, sonst als
 * PNG), Bilder werden als PNG/JPEG geladen.
 */

import { type BrandPack } from '@ggraphic/core';
import { measureTextWidthWithFont } from '../../utils/textUtils.js';

import { buildPptxModel, type PptxPageState } from './buildPptxModel.js';
import { createVectorizer } from './vectorizeElement.js';
import { writePptx, type PptxLoadedImage, type PptxRasterImage } from './writePptx.js';

import type { PptxRasterRequest } from './types.js';
import type { CanvasFormat } from '../../formats/index.js';
import type { VectorExportDeps } from '../vectorExport.js';

const PPTX_IMAGE_TYPES = ['image/png', 'image/jpeg'];
/** SVGs ohne Eigenmaße werden in dieser Breite gerastert. */
const FALLBACK_IMAGE_SIZE = 1600;

function readAsDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function decode(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * Ein Bild als PNG/JPEG-Data-URL mit Eigenmaßen. WebP, GIF und SVG kennt
 * nicht jedes Präsentationsprogramm, sie werden zu PNG. `null`, wenn die
 * Quelle nicht lädt (z. B. CORS) — der Writer rastert das Element dann.
 */
export async function loadPptxImage(src: string): Promise<PptxLoadedImage | null> {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await decode(objectUrl);
      if (!image) return null;
      const width = image.naturalWidth || FALLBACK_IMAGE_SIZE;
      const height = image.naturalHeight || FALLBACK_IMAGE_SIZE;
      if (PPTX_IMAGE_TYPES.includes(blob.type)) {
        const dataUrl = await readAsDataUrl(blob);
        return dataUrl ? { dataUrl, width, height } : null;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png');
      canvas.width = 0;
      canvas.height = 0;
      return { dataUrl, width, height };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

export interface ExportPptxDeckOptions {
  pages: readonly PptxPageState[];
  format: CanvasFormat;
  /** Rastert ein Element der Seite `slideIndex`; null ohne Knoten. */
  rasterizeElement: (slideIndex: number, elementId: string) => Promise<PptxRasterImage | null>;
  /**
   * What the SVG export records pages with (`recordPage(slideIndex)` among it). With it, an
   * element that would be a PNG is an SVG image when its recording is vector all the way; the PNG
   * stays for the rest. Each slide is recorded once, and only if one of its elements asks.
   */
  vector?: VectorExportDeps;
  title?: string;
  /** Das Paket des Dokuments (`FullCanvasConfig.brand`); ohne: das aktive. */
  brand?: BrandPack;
  onProgress?: (done: number, total: number) => void;
}

export async function exportPptxDeck({
  pages,
  format,
  rasterizeElement,
  vector,
  title,
  brand,
  onProgress,
}: ExportPptxDeckOptions): Promise<Blob> {
  const model = buildPptxModel(pages, format, {
    measure: measureTextWidthWithFont,
    ...(brand ? { brand } : {}),
  });
  const { blob } = await writePptx(model, {
    rasterize: (request: PptxRasterRequest, slideIndex: number) =>
      rasterizeElement(slideIndex, request.elementId),
    ...(vector ? { vectorize: createVectorizer(vector) } : {}),
    loadImage: loadPptxImage,
    ...(title ? { title } : {}),
    ...(onProgress ? { onProgress } : {}),
  });
  return blob;
}
