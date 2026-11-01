// SPDX-License-Identifier: MPL-2.0
import Konva from 'konva';
import { createContext, useContext } from 'react';

/**
 * True on a canvas drawn only to be captured once (a gallery or page preview).
 *
 * Konva runs an image's filters over its cache, and `cache()` without a ratio
 * sizes that cache at page size times the device ratio: a portrait photo is
 * filtered over 2160 × 2700 pixels for a preview drawn 400 px wide. Measured
 * at 4x CPU throttling, 01.11.2026: a duotone photo held one frame for 308 ms.
 * The editor keeps the full cache, so zooming in stays sharp.
 */
export const PreviewRenderContext = createContext(false);

export function useIsPreviewRender(): boolean {
  return useContext(PreviewRenderContext);
}

/** Caches a filtered node; on a preview at the resolution the stage draws it. */
export function cacheFiltered(node: Konva.Node, preview: boolean): void {
  if (!preview) {
    node.cache();
    return;
  }
  node.cache({ pixelRatio: node.getAbsoluteScale().x * Konva.pixelRatio });
}
