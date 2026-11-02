// SPDX-License-Identifier: AGPL-3.0-only
import Konva from 'konva';
import { createContext, useContext } from 'react';

/**
 * On a canvas drawn only to be captured once (a gallery or page preview): the output pixels per
 * page pixel of that capture. Null in the editor.
 *
 * Konva runs an image's filters over its cache, and `cache()` without a ratio sizes that cache at
 * page size times the device ratio: a portrait photo is filtered over 2160 × 2700 pixels for a
 * preview drawn 400 px wide. Measured at 4x CPU throttling, 01.11.2026: a duotone photo held one
 * frame for 308 ms. A preview caches at what it draws or what it captures, whichever is larger,
 * so a full-size capture (the render gate) stays sharp. The editor keeps the full cache, so
 * zooming in stays sharp.
 */
export const PreviewRenderContext = createContext<number | null>(null);

export function usePreviewCaptureRatio(): number | null {
  return useContext(PreviewRenderContext);
}

/** Caches a filtered node; on a preview at the resolution it is drawn or captured at. */
export function cacheFiltered(node: Konva.Node, captureRatio: number | null): void {
  if (captureRatio === null) {
    node.cache();
    return;
  }
  const absolute = node.getAbsoluteScale().x;
  // The stage carries the display scale; what remains is the node's scale within the page.
  const withinPage = absolute / (node.getStage()?.scaleX() || 1);
  node.cache({
    pixelRatio: Math.max(absolute * Konva.pixelRatio, withinPage * captureRatio),
  });
}
