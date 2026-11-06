// SPDX-License-Identifier: AGPL-3.0-only
import { parseDataUrl } from '@ggraphic/schema';
import { zipSync } from 'fflate';

import { messages } from '../i18n/catalogue.js';

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Packs files into a ZIP in the browser, in the order given. `level` is fflate's: 0 stores the
 * bytes as they are (right for PNG and JPEG, which are compressed already), 6 deflates (SVG).
 */
export function zipFiles(files: { name: string; bytes: Uint8Array }[], level: 0 | 6 = 6): Blob {
  const entries: Record<string, Uint8Array> = {};
  for (const { name, bytes } of files) entries[name] = bytes;
  return new Blob([zipSync(entries, { level })], { type: 'application/zip' });
}

/**
 * Packs rendered pages (data URLs) into a ZIP in the browser, as
 * `seite-1.png`, `seite-2.png`, … (the catalogue's `export.pageFile`) — the
 * extension follows each image's type.
 *
 * A page that cannot be packed throws: a ZIP with fewer images than pages
 * reads as data loss.
 */
export function zipPageImages(dataUrls: string[]): Blob {
  const files = dataUrls.map((dataUrl, i) => {
    const parsed = parseDataUrl(dataUrl);
    const extension = parsed ? EXTENSION_BY_TYPE[parsed.mediaType] : undefined;
    if (!parsed || !extension) throw new Error(messages().errors.pageExport(i + 1));
    return {
      name: `${messages().export.pageFile}-${i + 1}.${extension}`,
      bytes: Uint8Array.from(atob(parsed.base64), (c) => c.charCodeAt(0)),
    };
  });
  // Stored, not deflated: PNG and JPEG are compressed already.
  return zipFiles(files, 0);
}
