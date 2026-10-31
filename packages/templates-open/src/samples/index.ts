// SPDX-License-Identifier: CC0-1.0
import samples from './samples.json' with { type: 'json' };

export type SamplePhotoRole = 'portrait' | 'scene' | 'detail' | 'crowd';

/**
 * A photo for previews and render-gate goldens only: it fills an empty photo slot so a
 * template shows how it looks with a picture. It is never stored in a document or exported.
 */
export interface SamplePhoto {
  /** The file name in this directory; the key of its row in `samples.json`. */
  file: string;
  /** What is in the picture: `crowd` = people seen from behind or at a distance. */
  role: SamplePhotoRole;
  /** URL the browser (or Node) loads the picture from. */
  src: string;
  source: string;
  licence: string;
  author: string;
}

// `new URL(literal, import.meta.url)` is the form bundlers (Vite) rewrite to an emitted asset;
// each file is spelled out so the bundler sees it.
const URLS: Record<string, string> = {
  'portrait-1.jpg': new URL('./portrait-1.jpg', import.meta.url).href,
  'portrait-2.jpg': new URL('./portrait-2.jpg', import.meta.url).href,
  'group-1.jpg': new URL('./group-1.jpg', import.meta.url).href,
  'group-2.jpg': new URL('./group-2.jpg', import.meta.url).href,
  'trees.jpg': new URL('./trees.jpg', import.meta.url).href,
  'garden.jpg': new URL('./garden.jpg', import.meta.url).href,
  'bicycles.jpg': new URL('./bicycles.jpg', import.meta.url).href,
  'square.jpg': new URL('./square.jpg', import.meta.url).href,
  'hands.jpg': new URL('./hands.jpg', import.meta.url).href,
  'meeting.jpg': new URL('./meeting.jpg', import.meta.url).href,
};

export const SAMPLE_PHOTOS: readonly SamplePhoto[] = samples.photos.map((row) => ({
  ...row,
  role: row.role as SamplePhotoRole,
  src: URLS[row.file] ?? '',
}));
