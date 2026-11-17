// SPDX-License-Identifier: AGPL-3.0-only
import { messages } from '../i18n/catalogue.js';
/**
 * PDF eines digitalen Folien-Decks: eine PDF-Seite je Folie, 16:9, das
 * gerasterte PNG füllt die Seite. Kein Beschnitt, keine Schnittmarken.
 * `pdf-lib` kommt erst hier per dynamischem `import()`.
 */

import { parseDataUrl } from '@ggraphic/schema';

function dataUrlToBytes(dataUrl: string, index: number): Uint8Array {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || parsed.mediaType !== 'image/png') {
    throw new Error(messages().errors.slideExport(index + 1));
  }
  return Uint8Array.from(atob(parsed.base64), (c) => c.charCodeAt(0));
}

/** 1920 × 1080 px bei 72 dpi: eine Folie ist so viele Punkte groß wie Pixel breit. */
export const SLIDE_PDF_PAGE_PT = { width: 1920, height: 1080 } as const;

/** `size` is the page in pt: a slide by default; a digital page picks its own. */
export async function buildSlidesPdf({
  pngs,
  size = SLIDE_PDF_PAGE_PT,
}: {
  pngs: (Uint8Array | (() => Uint8Array))[];
  size?: { width: number; height: number };
}): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const { width, height } = size;
  for (const png of pngs) {
    const image = await doc.embedPng(typeof png === 'function' ? png() : png);
    const page = doc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  return doc.save();
}

export async function exportSlidesPdf(
  pageDataUrls: string[],
  size?: { width: number; height: number }
): Promise<Uint8Array> {
  return buildSlidesPdf({
    pngs: pageDataUrls.map((url, i) => () => dataUrlToBytes(url, i)),
    ...(size ? { size } : {}),
  });
}
