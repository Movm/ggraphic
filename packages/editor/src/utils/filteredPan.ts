// SPDX-License-Identifier: AGPL-3.0-only
import type Konva from 'konva';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const scaleRect = (r: Rect, s: number): Rect => ({
  x: r.x * s,
  y: r.y * s,
  width: r.width * s,
  height: r.height * s,
});

/** A pan of a filtered photo over its pre-filtered copy; `end` puts the photo and its filters back. */
export interface FilteredPan {
  /** Sets a crop given in the photo's own pixels on the copy. */
  crop: (crop: Rect) => void;
  end: () => void;
}

/**
 * Pans a filtered photo without filtering it again on every move. A filtered node draws from its
 * cache, and a new crop needs a new cache: one pass of every filter over the bitmap per pointer
 * move (#197). Instead the node shows `source` — the whole photo, filtered once at the resolution
 * it is shown at — with its crop scaled to that copy, and no filters or cache. Null when `source`
 * is the photo itself (nothing to filter).
 */
export function beginFilteredPan(
  node: Konva.Image,
  source: CanvasImageSource,
  naturalWidth: number
): FilteredPan | null {
  const photo = node.image();
  if (!photo || source === photo || !('width' in source)) return null;
  const sourceWidth = Number(source.width);
  if (!sourceWidth || !naturalWidth) return null;
  const s = sourceWidth / naturalWidth;
  const filters = node.filters();
  node.clearCache();
  node.filters([]);
  node.image(source);
  node.crop(scaleRect(node.crop(), s));
  return {
    crop: (crop) => node.crop(scaleRect(crop, s)),
    end: () => {
      const crop = node.crop();
      node.image(photo);
      node.filters(filters);
      node.crop(scaleRect(crop, 1 / s));
    },
  };
}
