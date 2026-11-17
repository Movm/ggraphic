// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, type RefObject } from 'react';

import {
  builtLookBitmap,
  LOOK_IMAGE_ATTR,
  LOOK_QUICK_AREA,
  lookBitmap,
  lookBitmapSize,
  lookKey,
  lookPixelRatio,
} from '../utils/lookBitmap.js';

import type Konva from 'konva';
import type { ImageAdjustments } from '../utils/userImageUtils.js';

// A look change that rests this long gets its full-size bitmap. A slider commits about every
// 300 ms while it is dragged (measured 16.11.2026); a shorter wait built the full bitmap, ~55 ms
// for a 7 MP photo, between two commits of one drag.
const SETTLE_MS = 400;

/**
 * Hands the nodes in `refs` the look bitmap of `image` (`LOOK_IMAGE_ATTR`), the first node sizing
 * it. Only a new photo, a new look or a larger draw makes a bitmap; a pan, zoom or crop does not.
 * While the look changes (a slider drag) a small bitmap is shown at once and the full one once the
 * look rests; a capture (`captureRatio` set) always gets the full one at once.
 */
export function useLookBitmap(
  refs: readonly RefObject<Konva.Image | null>[],
  image: HTMLImageElement | null,
  adjustments: ImageAdjustments | null,
  color: string | null,
  /** How wide the whole photo is drawn, in node units. */
  photoWidth: number,
  captureRatio: number | null,
  /** Changes when a node in `refs` mounts or unmounts (the dimmed rest of the photo). */
  mounted: unknown = null
): void {
  const key = lookKey(adjustments, color);
  const latest = useRef({ adjustments, color });
  latest.current = { adjustments, color };
  const shownKey = useRef<{ image: HTMLImageElement; key: string } | null>(null);
  const width = Math.round(photoWidth);

  useEffect(() => {
    const main = refs[0]?.current;
    if (!main || !image) return undefined;
    const apply = (source: CanvasImageSource | null) => {
      for (const ref of refs) {
        const node = ref.current;
        if (!node) continue;
        node.setAttr(LOOK_IMAGE_ATTR, source ?? undefined);
        node.getLayer()?.batchDraw();
      }
    };
    if (key === null || width <= 0) {
      shownKey.current = null;
      apply(null);
      return undefined;
    }
    const natural = { width: image.naturalWidth, height: image.naturalHeight };
    const size = lookBitmapSize(natural, width, lookPixelRatio(main, captureRatio));
    const full = () => {
      const { adjustments: look, color: tint } = latest.current;
      apply(lookBitmap(image, look, tint, width, size));
    };
    const previous = shownKey.current;
    shownKey.current = { image, key };
    const changing = previous !== null && previous.image === image && previous.key !== key;
    if (
      !changing ||
      captureRatio !== null ||
      size.width * size.height <= LOOK_QUICK_AREA ||
      builtLookBitmap(image, key, size.width)
    ) {
      full();
      return undefined;
    }
    const { adjustments: look, color: tint } = latest.current;
    apply(lookBitmap(image, look, tint, width, lookBitmapSize(natural, width, 1, LOOK_QUICK_AREA)));
    const timer = setTimeout(full, SETTLE_MS);
    return () => clearTimeout(timer);
    // `refs` holds stable refs; `latest` carries the look the key stands for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, key, width, captureRatio, mounted]);
}
