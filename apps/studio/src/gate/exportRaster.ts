// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Draws an exported file the way a viewer would, at the size of the page, for the render gate's
 * stage 3: an SVG by the browser, a PDF by pdf.js. Both end as a PNG data URL.
 *
 * Gate only (it is imported by `main.tsx` alone): pdf.js is a dev dependency of the Studio and
 * must not reach the production bundle.
 */
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface Drawn {
  /** PNG data URL, `width` × `height` px. */
  png: string;
  /** The file's own size: SVG user units, PDF pt of the first page. */
  natural: { width: number; height: number };
}

function newCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2D canvas context');
  // The page has a background of its own; white is what a viewer shows behind a file without one.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  return [canvas, context];
}

// ---------------------------------------------------------------------------------------------
// SVG

/** A CSS string without its quotes. */
const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, '');

function base64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return btoa(binary);
}

/**
 * `svg` with the page's web fonts inside it. An SVG drawn as an `<img>` cannot reach the fonts of
 * the page that shows it, only installed ones; an editable SVG names its fonts and leaves it to
 * the viewer to have them. This gives the viewer the fonts the page has: every `@font-face` of a
 * family the SVG names, in a style it uses, with its file inlined.
 *
 * Every weight of the family goes in, not only the weights the SVG names: a text asks for 500 or
 * 600 and the browser picks the nearest face it has (400 or 700), which is a face the SVG never
 * names. Leaving those out drew the text in the fallback face, a difference the canvas does not have.
 */
async function withPageFonts(svg: string): Promise<string> {
  const styles = new Set([...svg.matchAll(/font-style="(\w+)"/g)].map((m) => m[1]));
  if (!svg.includes('<text')) return svg;
  const faces: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // a stylesheet of another origin
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const declared = (name: string) => rule.style.getPropertyValue(name);
      const family = unquote(declared('font-family'));
      if (!family || !svg.includes(family)) continue;
      const style = /^\s*(italic|oblique)/.test(declared('font-style')) ? 'italic' : 'normal';
      if (!styles.has(style)) continue;
      const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(declared('src'))?.[1];
      if (!url) continue;
      const response = await fetch(new URL(url, sheet.href ?? document.baseURI));
      if (!response.ok) throw new Error(`font ${url}: HTTP ${response.status}`);
      const data = base64(new Uint8Array(await response.arrayBuffer()));
      const range = declared('unicode-range');
      faces.push(
        `@font-face{font-family:"${family}";font-style:${style};font-weight:${declared('font-weight') || '400'};` +
          `${range ? `unicode-range:${range};` : ''}src:url(data:font/woff2;base64,${data}) format("woff2");}`
      );
    }
  }
  if (faces.length === 0) return svg;
  return svg.replace(/(<svg\b[^>]*>)/, `$1<style>${faces.join('')}</style>`);
}

/** The SVG as the browser draws it in an `<img>`, scaled onto a canvas of `width` × `height`. */
export async function drawSvg(svg: string, width: number, height: number): Promise<Drawn> {
  const withFonts = await withPageFonts(svg);
  const url = URL.createObjectURL(new Blob([withFonts], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // The fonts inside the SVG are data URLs, which a browser takes in at once; the pause is for
    // the one that does not, so a text drawn in the fallback face cannot pass for a finding.
    if (withFonts !== svg) await new Promise((resolve) => setTimeout(resolve, 100));
    const [canvas, context] = newCanvas(width, height);
    context.drawImage(image, 0, 0, width, height);
    return {
      png: canvas.toDataURL('image/png'),
      natural: { width: image.naturalWidth, height: image.naturalHeight },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------------------------
// PDF

/** First page of the PDF as pdf.js draws it, scaled so the page is `width` px wide. */
export async function drawPdf(bytes: Uint8Array, width: number, height: number): Promise<Drawn> {
  // pdf.js takes the buffer over; give it a copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / natural.width });
    const [canvas] = newCanvas(width, height);
    await page.render({ canvas, viewport }).promise;
    return {
      png: canvas.toDataURL('image/png'),
      natural: { width: natural.width, height: natural.height },
    };
  } finally {
    await task.destroy();
  }
}
