// SPDX-License-Identifier: AGPL-3.0-only
// Upload type detection by content (never by client-supplied name or MIME type).
import { randomBytes } from 'node:crypto';

export const IMAGE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
} as const;

export type ImageExt = keyof typeof IMAGE_TYPES;

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

const ascii = (buf: Buffer, start: number, end: number) =>
  buf.subarray(start, end).toString('latin1');

// An SVG document: optional BOM, XML declaration, comments and doctype, then the <svg> root.
const SVG_PROLOGUE =
  /^\uFEFF?\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>/]/i;

export function isPng(buf: Buffer): boolean {
  return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

/** Returns the file extension for a supported image, or null for anything else. */
export function detectImageType(buf: Buffer): ImageExt | null {
  if (isPng(buf)) return 'png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpg';
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(buf, 0, 6))) return 'gif';
  if (buf.length >= 12 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP')
    return 'webp';
  if (
    buf.length >= 12 &&
    ascii(buf, 4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(ascii(buf, 8, 12))
  )
    return 'avif';
  // Text sniffing only on the head; a real SVG names its root element early.
  if (SVG_PROLOGUE.test(buf.subarray(0, 4096).toString('utf8'))) return 'svg';
  return null;
}

/** 128 random bits plus the detected extension. Never derived from user input. */
export function randomFileName(ext: ImageExt): string {
  return `${randomBytes(16).toString('hex')}.${ext}`;
}

const STORED_NAME = /^([0-9a-f]{32})\.(png|jpg|gif|webp|avif|svg)$/;

/** Parses a stored upload name. Anything else (including traversal attempts) is null. */
export function parseStoredName(name: string): ImageExt | null {
  const match = STORED_NAME.exec(name);
  return match ? (match[2] as ImageExt) : null;
}
