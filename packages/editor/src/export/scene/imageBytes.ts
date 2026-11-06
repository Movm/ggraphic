// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The bytes behind one drawn image, as a source a writer can embed (`SceneImageSource`).
 *
 * - PNG and JPEG pass through with their metadata removed (`stripJpegMetadata`,
 *   `stripPngMetadata`: Exif and its GPS position, XMP, text chunks), the image data untouched. A
 *   JPEG with an EXIF orientation other than 1 does not pass through: the browser turns it when
 *   it draws, a file does not, so it goes through `reencode`, which drops the metadata with it.
 * - WebP, GIF and AVIF are re-encoded: opaque ones as JPEG, the others as PNG.
 * - An SVG the editor generated itself is inlined as it is (`trusted`: the caller knows from who
 *   made the image element, see `trustedSvgImages.ts`; the look of the url proves nothing). Every
 *   other SVG is a trust boundary and goes through `sanitizeSvg` before it is inlined anywhere.
 *   The sanitiser also strips what an SVG may be drawn with (`<style>`, `class`, `<text>` …), so
 *   a foreign SVG that uses any of it is not inlined at all: it is `svg-unsupported`, and the
 *   caller draws it from the stage.
 *
 * Every function answers a failure rather than throwing; the caller decides what that costs.
 */
import { sanitizeSvg } from '@ggraphic/schema';

import type { SceneImageSource } from './types.js';

export interface ImageByteDeps {
  fetchBytes: (url: string) => Promise<{ bytes: Uint8Array; mime: string } | null>;
  /** Re-encodes any decodable image; browser: canvas, tests: napi. */
  reencode: (
    bytes: Uint8Array,
    mime: string,
    /**
     * true: JPEG at 0.92, the source has no alpha. false: PNG, it may have. null: unknown, so look
     * at the decoded pixels: JPEG when none is transparent, else PNG.
     */
    opaque: boolean | null
  ) => Promise<{
    bytes: Uint8Array;
    mime: 'image/png' | 'image/jpeg';
    width: number;
    height: number;
  } | null>;
}

/** A source, or why there is none: unreadable, or an SVG that cannot be inlined faithfully. */
export type SourceOutcome =
  | { ok: true; source: SceneImageSource }
  | { ok: false; reason: 'image-unreadable' | 'svg-unsupported' };

const UNREADABLE: SourceOutcome = { ok: false, reason: 'image-unreadable' };
const UNSUPPORTED: SourceOutcome = { ok: false, reason: 'svg-unsupported' };

const found = (source: SceneImageSource | null): SourceOutcome =>
  source ? { ok: true, source } : UNREADABLE;

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
 * Whether a WebP can have transparent pixels, from its first chunk: `VP8 ` (lossy) never does and
 * `VP8X` says so in its flags. `VP8L` (lossless) is taken to: its `alpha_is_used` bit is only a
 * hint, and a lossless file that ignores it still decodes with transparency.
 */
function webpHasAlpha(bytes: Uint8Array): boolean {
  if (startsWith(bytes, 12, 'VP8X')) return ((bytes[20] ?? 0) & 0x10) !== 0;
  return startsWith(bytes, 12, 'VP8L');
}

/** One marker segment of a JPEG: `start` is its 0xFF, `end` the byte after its last. */
interface JpegSegment {
  marker: number;
  start: number;
  end: number;
}

/**
 * The marker segments of a JPEG that have a length, in file order, up to the image data (`SOS`)
 * or the end. A segment cut off by the end of the file ends at the end of the file. The walk stops
 * where the structure stops making sense; what lies beyond is not a segment of ours.
 */
function* jpegSegments(bytes: Uint8Array): Generator<JpegSegment> {
  const at = (i: number) => bytes[i] ?? 0;
  if (at(0) !== 0xff || at(1) !== 0xd8) return;
  let cursor = 2;
  while (cursor + 4 <= bytes.length) {
    if (at(cursor) !== 0xff) return;
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
    // Image data or the end: no segment of this kind comes after it.
    if (marker === 0xda || marker === 0xd9) return;
    const length = (at(cursor + 2) << 8) | at(cursor + 3);
    if (length < 2) return;
    const end = Math.min(cursor + 2 + length, bytes.length);
    yield { marker, start: cursor, end };
    cursor += 2 + length;
  }
}

/**
 * The orientation tag (EXIF 0x0112, 1..8) of a JPEG; 1 when there is none, or when the file is
 * not one we can read it from. Reads the first IFD of the Exif segment's TIFF block in whichever
 * byte order it declares.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  for (const { marker, start, end } of jpegSegments(bytes)) {
    if (marker === 0xe1 && startsWith(bytes, start + 4, 'Exif\0\0')) {
      return tiffOrientation(bytes, start + 10, end);
    }
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
// Metadata

/** `bytes` without the half-open `ranges` (in order, not overlapping); the same array when none. */
function withoutRanges(bytes: Uint8Array, ranges: readonly { start: number; end: number }[]) {
  if (ranges.length === 0) return bytes;
  const removed = ranges.reduce((total, { start, end }) => total + (end - start), 0);
  const kept = new Uint8Array(bytes.length - removed);
  let from = 0;
  let to = 0;
  for (const { start, end } of ranges) {
    kept.set(bytes.subarray(from, start), to);
    to += start - from;
    from = end;
  }
  kept.set(bytes.subarray(from), to);
  return kept;
}

/**
 * Whether a JPEG segment is part of the picture rather than about it. APP0 (JFIF) and APP14
 * (Adobe: the colour transform of a CMYK or YCCK file) are read by decoders; APP2 only when it
 * carries the ICC profile. APP1 (Exif, XMP, and with them the GPS position), APP3 to APP13 and
 * APP15 (Photoshop, IPTC …) and comments are not.
 */
function isJpegPicture(bytes: Uint8Array, { marker, start }: JpegSegment): boolean {
  if (marker === 0xe0 || marker === 0xee) return true;
  if (marker === 0xe2) return startsWith(bytes, start + 4, 'ICC_PROFILE\0');
  return !(marker >= 0xe1 && marker <= 0xef) && marker !== 0xfe;
}

/**
 * The JPEG without its metadata: the image data and what decodes it stay byte for byte. A photo
 * is placed in a file that is sent on, and its Exif can hold where it was taken. A file whose
 * segments cannot be walked to the image data is returned as it is: a decoder cannot find
 * metadata in what it cannot walk either.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  return withoutRanges(
    bytes,
    [...jpegSegments(bytes)].filter((segment) => !isJpegPicture(bytes, segment))
  );
}

/** PNG chunks that are text, a timestamp or Exif: about the picture, not part of it. */
const PNG_METADATA = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/**
 * The PNG without its text, time and Exif chunks. The colour chunks (`iCCP`, `sRGB`, `gAMA`,
 * `cHRM`) and `pHYs` stay, and so does every chunk that is the image. A file whose chunks do not
 * add up is returned as far as they did: what was found before the break is dropped.
 */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  const dropped: { start: number; end: number }[] = [];
  let cursor = 8;
  while (cursor + 12 <= bytes.length) {
    const length =
      (bytes[cursor] ?? 0) * 0x1000000 +
      (((bytes[cursor + 1] ?? 0) << 16) |
        ((bytes[cursor + 2] ?? 0) << 8) |
        (bytes[cursor + 3] ?? 0));
    const end = cursor + 12 + length;
    if (end > bytes.length) break;
    const type = String.fromCharCode(...bytes.subarray(cursor + 4, cursor + 8));
    if (PNG_METADATA.has(type)) dropped.push({ start: cursor, end });
    if (type === 'IEND') break;
    cursor = end;
  }
  return withoutRanges(bytes, dropped);
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

/** The bytes of a base64 PNG data url, or null for anything else. */
export function pngFromDataUrl(dataUrl: string): Uint8Array | null {
  const data = parseDataUrl(dataUrl);
  return data?.base64 && data.mime === 'image/png' ? base64Bytes(data.payload) : null;
}

/** The PNG of a canvas, or null for an empty or tainted one. */
export function canvasPng(canvas: { toDataURL(type?: string): string }): Uint8Array | null {
  try {
    return pngFromDataUrl(canvas.toDataURL('image/png'));
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

const svg = (markup: string, size: ImageSize): SceneImageSource => ({
  kind: 'svg',
  markup,
  ...size,
});

/**
 * What `sanitizeSvg` throws away that a picture is drawn with: style sheets, `class` and `style`
 * attributes, text, embedded images, filters, patterns, markers, links and `switch`, animation.
 * Looked for in the markup as it was, because the sanitised copy cannot say what is missing from
 * it. A hit may be a false alarm (the word in a text node); the cost is a raster instead of a
 * vector, never a lost picture.
 */
const LOST_BY_SANITISING =
  /<(?:[\w-]+:)?(?:style|text|image|filter|foreignObject|pattern|marker|a|switch|animate\w*|set)[\s/>]|\s(?:class|style|filter)\s*=/i;

/** An SVG that is not ours: sanitised, or `svg-unsupported` when sanitising would change it. */
function foreignSvg(markup: string, size: ImageSize): SourceOutcome {
  if (LOST_BY_SANITISING.test(markup)) return UNSUPPORTED;
  const clean = sanitizeSvg(markup);
  return clean === null ? UNSUPPORTED : { ok: true, source: svg(clean, size) };
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
  opaque: boolean | null,
  size: ImageSize,
  deps: ImageByteDeps
): Promise<SourceOutcome> {
  const result = await attempt(() => deps.reencode(bytes, mime, opaque));
  if (!result) return UNREADABLE;
  // The size is the one the canvas measured its source rectangle in; the bitmap only supplies it
  // when the element had none.
  return found(
    bitmap(result.mime, result.bytes, {
      width: size.width || result.width,
      height: size.height || result.height,
    })
  );
}

async function fromBytes(
  bytes: Uint8Array,
  mime: string,
  size: ImageSize,
  deps: ImageByteDeps,
  trusted: boolean
): Promise<SourceOutcome> {
  const raster = sniffRaster(bytes);
  if (raster === 'image/png') return found(bitmap(raster, stripPngMetadata(bytes), size));
  if (raster === 'image/jpeg') {
    return jpegOrientation(bytes) === 1
      ? found(bitmap(raster, stripJpegMetadata(bytes), size))
      : reencoded(bytes, raster, true, size, deps);
  }
  if (raster) {
    // Only a WebP says whether it has alpha without being decoded; for the rest, the pixels do.
    const opaque = raster === 'image/webp' ? !webpHasAlpha(bytes) : null;
    return reencoded(bytes, raster, opaque, size, deps);
  }
  if (!isSvgText(bytes, mime)) return UNREADABLE;
  const markup = decodeText(bytes);
  return trusted ? { ok: true, source: svg(markup, size) } : foreignSvg(markup, size);
}

/**
 * The source behind an image url. `trusted`: the image element was made by editor code that
 * generated this SVG itself (`isTrustedSvgImage`); it only matters for SVG.
 */
export async function sourceFromUrl(
  url: string,
  size: ImageSize,
  deps: ImageByteDeps,
  trusted: boolean
): Promise<SourceOutcome> {
  const data = parseDataUrl(url);
  if (data?.mime === 'image/svg+xml') {
    const markup = dataUrlText(data);
    if (markup === null) return UNREADABLE;
    return trusted ? { ok: true, source: svg(markup, size) } : foreignSvg(markup, size);
  }
  const fetched = data?.base64 ? bytesOf(data) : await attempt(() => deps.fetchBytes(url));
  return fetched ? fromBytes(fetched.bytes, fetched.mime, size, deps, trusted) : UNREADABLE;
}

function bytesOf(data: DataUrl): { bytes: Uint8Array; mime: string } | null {
  const bytes = base64Bytes(data.payload);
  return bytes ? { bytes, mime: data.mime } : null;
}

/** A canvas's pixels as a PNG source. */
export function sourceFromCanvas(
  canvas: { toDataURL(type?: string): string },
  size: ImageSize
): SourceOutcome {
  const png = canvasPng(canvas);
  return found(png ? bitmap('image/png', png, size) : null);
}
