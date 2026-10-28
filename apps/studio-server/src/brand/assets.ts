// SPDX-License-Identifier: AGPL-3.0-only
// Brand assets (logo, fonts): type by content, server-generated names, nothing from the client.
import { randomBytes } from 'node:crypto';
import { detectImageType } from '../uploads.ts';

export const BRAND_ASSET_TYPES = {
  png: 'image/png',
  webp: 'image/webp',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
} as const;

export type BrandAssetExt = keyof typeof BRAND_ASSET_TYPES;
export type LogoExt = 'png' | 'webp';
export type FontExt = 'woff2' | 'ttf' | 'otf';

/**
 * PNG or WebP. SVG is refused on purpose: making untrusted SVG safe needs a sanitiser
 * plus a DOM in the server, and a logo works as well as a raster image.
 */
export function detectLogoType(buf: Buffer): LogoExt | null {
  const ext = detectImageType(buf);
  return ext === 'png' || ext === 'webp' ? ext : null;
}

/** WOFF2, TrueType or OpenType (CFF) by their magic numbers. Collections and WOFF 1 are not. */
export function detectFontType(buf: Buffer): FontExt | null {
  if (buf.length < 12) return null;
  const tag = buf.subarray(0, 4).toString('latin1');
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'OTTO') return 'otf';
  if (tag === 'true' || buf.readUInt32BE(0) === 0x00010000) return 'ttf';
  return null;
}

export function randomAssetName(ext: BrandAssetExt): string {
  return `${randomBytes(16).toString('hex')}.${ext}`;
}

const STORED_NAME = /^([0-9a-f]{32})\.(png|webp|woff2|ttf|otf)$/;

/** Parses a stored asset name; anything else (traversal included) is null. */
export function parseAssetName(name: string): BrandAssetExt | null {
  const match = STORED_NAME.exec(name);
  return match ? (match[2] as BrandAssetExt) : null;
}
