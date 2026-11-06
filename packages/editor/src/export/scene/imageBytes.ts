// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The bytes behind one drawn image, as a source a writer can embed (`SceneImageSource`).
 *
 * - PNG and JPEG pass through unchanged. A JPEG with an EXIF orientation other than 1 does not:
 *   the browser turns it when it draws, a file does not, so it goes through `reencode`.
 * - WebP, GIF and AVIF are re-encoded: opaque ones as JPEG, the others as PNG.
 * - An SVG of ours (`data:image/svg+xml…`, made by the chart, icon and illustration primitives) is
 *   decoded and trusted. Any other SVG is a trust boundary and goes through `sanitizeSvg` before
 *   it is inlined anywhere; markup the sanitiser refuses is unreadable.
 *
 * Every function answers `null` for "cannot be read"; the caller decides what that costs.
 */
import { sanitizeSvg } from '@ggraphic/schema';

import type { SceneImageSource } from './types.js';

export interface ImageByteDeps {
  fetchBytes: (url: string) => Promise<{ bytes: Uint8Array; mime: string } | null>;
  /** Re-encodes any decodable image; browser: canvas, tests: napi. */
  reencode: (
    bytes: Uint8Array,
    mime: string,
    opaque: boolean
  ) => Promise<{
    bytes: Uint8Array;
    mime: 'image/png' | 'image/jpeg';
    width: number;
    height: number;
  } | null>;
}

/** The size the image was drawn from: what the canvas's source rectangle is measured in. */
export interface ImageSize {
  width: number;
  height: number;
}

export type RasterMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/avif';

/** Runs `work`; a throw is "cannot be read", like any other failure to read. */
export async function attempt<T>(work: () => Promise<T | null>): Promise<T | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Formats

const startsWith = (bytes: Uint8Array, at: number, text: string) =>
  [...text].every((char, n) => bytes[at + n] === char.charCodeAt(0));

/** The raster format the bytes are, by their magic number; what a server called it is not trusted. */
export function sniffRaster(bytes: Uint8Array): RasterMime | null {
  if (bytes[0] === 0x89 && startsWith(bytes, 1, 'PNG\r\n') && bytes[6] === 0x1a) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (startsWith(bytes, 0, 'GIF8')) return 'image/gif';
  if (startsWith(bytes, 0, 'RIFF') && startsWith(bytes, 8, 'WEBP')) return 'image/webp';
  if (
    startsWith(bytes, 4, 'ftyp') &&
    (startsWith(bytes, 8, 'avif') || startsWith(bytes, 8, 'avis'))
  ) {
    return 'image/avif';
  }
  return null;
}

/**
 * Whether a WebP can have transparent pixels, from its first chunk: `VP8 ` (lossy) never does,
 * `VP8X` says so in its flags, `VP8L` (lossless) in the `alpha_is_used` bit of its header.
 */
function webpHasAlpha(bytes: Uint8Array): boolean {
  if (startsWith(bytes, 12, 'VP8X')) return ((bytes[20] ?? 0) & 0x10) !== 0;
  if (startsWith(bytes, 12, 'VP8L')) return ((bytes[24] ?? 0) & 0x10) !== 0;
  return false;
}

/**
 * The orientation tag (EXIF 0x0112, 1..8) of a JPEG; 1 when there is none, or when the file is
 * not one we can read it from. Walks the marker segments up to the image data, then reads the
 * first IFD of the Exif segment's TIFF block in whichever byte order it declares.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  const at = (i: number) => bytes[i] ?? 0;
  if (at(0) !== 0xff || at(1) !== 0xd8) return 1;
  let cursor = 2;
  while (cursor + 4 <= bytes.length) {
    if (at(cursor) !== 0xff) return 1;
    const marker = at(cursor + 1);
    // Fill bytes, and the markers that stand alone and have no length.
    if (marker === 0xff) {
      cursor += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      cursor += 2;
      continue;
    }
    // Image data or the end: no Exif segment came before it.
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = (at(cursor + 2) << 8) | at(cursor + 3);
    if (length < 2) return 1;
    if (marker === 0xe1 && startsWith(bytes, cursor + 4, 'Exif\0\0')) {
      return tiffOrientation(bytes, cursor + 10, Math.min(cursor + 2 + length, bytes.length));
    }
    cursor += 2 + length;
  }
  return 1;
}

function tiffOrientation(bytes: Uint8Array, tiff: number, end: number): number {
  const at = (i: number) => bytes[i] ?? 0;
  const little = startsWith(bytes, tiff, 'II');
  if (!little && !startsWith(bytes, tiff, 'MM')) return 1;
  const u16 = (i: number) => (little ? at(i) | (at(i + 1) << 8) : (at(i) << 8) | at(i + 1));
  const u32 = (i: number) => (little ? u16(i) + u16(i + 2) * 65536 : u16(i) * 65536 + u16(i + 2));
  if (u16(tiff + 2) !== 42) return 1;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const entries = u16(ifd);
  for (let n = 0; n < entries; n += 1) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > end) return 1;
    // A SHORT sits in the first two bytes of the entry's value field, in either byte order.
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

// ---------------------------------------------------------------------------------------------
// Data urls

interface DataUrl {
  /** Lower case, without parameters. */
  mime: string;
  base64: boolean;
  payload: string;
}

export function parseDataUrl(url: string): DataUrl | null {
  const match = /^data:([^,]*),([\s\S]*)$/i.exec(url);
  if (!match) return null;
  const [mime = '', ...params] = (match[1] ?? '').split(';');
  return {
    mime: mime.trim().toLowerCase(),
    base64: params.some((param) => param.trim().toLowerCase() === 'base64'),
    payload: match[2] ?? '',
  };
}

function base64Bytes(payload: string): Uint8Array | null {
  try {
    const binary = atob(payload);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

const decodeText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function dataUrlText(data: DataUrl): string | null {
  if (data.base64) {
    const bytes = base64Bytes(data.payload);
    return bytes ? decodeText(bytes) : null;
  }
  try {
    return decodeURIComponent(data.payload);
  } catch {
    // Not percent-encoded after all (`data:image/svg+xml;utf8,<svg …>`).
    return data.payload;
  }
}

/** The PNG of a canvas, or null for an empty or tainted one. */
export function canvasPng(canvas: { toDataURL(type?: string): string }): Uint8Array | null {
  try {
    const data = parseDataUrl(canvas.toDataURL('image/png'));
    return data?.base64 && data.mime === 'image/png' ? base64Bytes(data.payload) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Sources

const bitmap = (
  mime: 'image/png' | 'image/jpeg',
  bytes: Uint8Array,
  size: ImageSize
): SceneImageSource => ({ kind: 'bitmap', mime, bytes, ...size });

const svg = (markup: string | null, size: ImageSize): SceneImageSource | null =>
  markup === null ? null : { kind: 'svg', markup, ...size };

/**
 * Markup that has no business in an image of ours. Our primitives never write any of it, so it
 * means the data url did not come from them, and the sanitiser sees it like any other upload.
 */
const ACTIVE_CONTENT = /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i;

/** An SVG data url: decoded and trusted unless it holds active content. */
function svgFromDataUrl(data: DataUrl, size: ImageSize): SceneImageSource | null {
  const markup = dataUrlText(data);
  if (markup === null) return null;
  return svg(ACTIVE_CONTENT.test(markup) ? sanitizeSvg(markup) : markup, size);
}

/** Whether fetched bytes are SVG text: by what the server said, or by how the text starts. */
function isSvgText(bytes: Uint8Array, mime: string): boolean {
  if (mime.toLowerCase().includes('svg')) return true;
  return /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(
    decodeText(bytes.subarray(0, 512))
  );
}

async function reencoded(
  bytes: Uint8Array,
  mime: string,
  opaque: boolean,
  size: ImageSize,
  deps: ImageByteDeps
): Promise<SceneImageSource | null> {
  const result = await attempt(() => deps.reencode(bytes, mime, opaque));
  if (!result) return null;
  // The size is the one the canvas measured its source rectangle in; the bitmap only supplies it
  // when the element had none.
  return bitmap(result.mime, result.bytes, {
    width: size.width || result.width,
    height: size.height || result.height,
  });
}

async function fromBytes(
  bytes: Uint8Array,
  mime: string,
  size: ImageSize,
  deps: ImageByteDeps
): Promise<SceneImageSource | null> {
  const raster = sniffRaster(bytes);
  if (raster === 'image/png') return bitmap(raster, bytes, size);
  if (raster === 'image/jpeg') {
    return jpegOrientation(bytes) === 1
      ? bitmap(raster, bytes, size)
      : reencoded(bytes, raster, true, size, deps);
  }
  if (raster) {
    // Only a WebP says whether it has alpha without being decoded; for the rest, PNG is safe.
    const opaque = raster === 'image/webp' && !webpHasAlpha(bytes);
    return reencoded(bytes, raster, opaque, size, deps);
  }
  return isSvgText(bytes, mime) ? svg(sanitizeSvg(decodeText(bytes)), size) : null;
}

/** The source behind an image url, or null when it cannot be read. */
export async function sourceFromUrl(
  url: string,
  size: ImageSize,
  deps: ImageByteDeps
): Promise<SceneImageSource | null> {
  const data = parseDataUrl(url);
  if (data?.mime === 'image/svg+xml') return svgFromDataUrl(data, size);
  const fetched = data?.base64 ? bytesOf(data) : await attempt(() => deps.fetchBytes(url));
  return fetched ? fromBytes(fetched.bytes, fetched.mime, size, deps) : null;
}

function bytesOf(data: DataUrl): { bytes: Uint8Array; mime: string } | null {
  const bytes = base64Bytes(data.payload);
  return bytes ? { bytes, mime: data.mime } : null;
}

/** A canvas's pixels as a PNG source. */
export function sourceFromCanvas(
  canvas: { toDataURL(type?: string): string },
  size: ImageSize
): SceneImageSource | null {
  const png = canvasPng(canvas);
  return png ? bitmap('image/png', png, size) : null;
}
