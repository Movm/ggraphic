// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the PPTX export checks of an SVG before it puts it in a slide. pptxgenjs makes the PNG
 * preview of every SVG image in one `Promise.all` with the rest of the media: an SVG that the
 * browser cannot decode, or that taints the canvas the preview is drawn on, rejects the lot and
 * the whole deck is lost. The same checks made here cost only that element its SVG.
 */

/** The data URL pptxgenjs is given (and hands to its own `Image`). UTF-8, not Latin-1. */
export function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/**
 * Whether the text parses as an SVG document. A label with a control character, say, makes
 * invalid XML that no `Image` loads. Without a `DOMParser` (node) there is nothing to ask.
 */
export function isWellFormedSvg(svg: string): boolean {
  if (typeof DOMParser === 'undefined') return true;
  try {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return (
      document.documentElement.localName === 'svg' &&
      document.getElementsByTagName('parsererror').length === 0
    );
  } catch {
    return false;
  }
}

/**
 * Whether a browser decodes the SVG and lets a canvas export it: what `createSvgPngPreview` of
 * pptxgenjs does, minus the size (one pixel is enough to see a refusal, and costs no memory).
 * Browser only.
 */
export function canPreviewSvg(svg: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      // pptxgenjs treats an image without a size as an error.
      if (image.width + image.height === 0) return resolve(false);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) return resolve(false);
        context.drawImage(image, 0, 0, 1, 1);
        // Throws on a tainted canvas.
        canvas.toDataURL('image/png');
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    image.onerror = () => resolve(false);
    image.src = svgDataUrl(svg);
  });
}
