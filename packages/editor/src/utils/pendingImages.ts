// SPDX-License-Identifier: AGPL-3.0-only
import { createContext, useContext, useEffect } from 'react';

/**
 * Ids of the image elements on one canvas whose source is still loading
 * (`pending`) or failed to load (`failed`).
 *
 * An image element draws nothing until its bitmap arrives, so a capture taken
 * meanwhile is a complete-looking picture minus the photo. The offscreen chat
 * preview asks `GenericCanvasRef.imagesSettled()` before capturing, and
 * `imageLoadState()` afterwards to tell a complete capture from one that is
 * missing an image; nothing else in the canvas needs to know.
 */
export interface ImageLoads {
  pending: Set<string>;
  failed: Set<string>;
}

export const PendingImagesContext = createContext<ImageLoads | null>(null);

/**
 * How often each element's load was retried (`GenericCanvasRef.retryFailedImages`).
 * A loader starts a fresh load when its number moves on: `use-image` loads
 * again only for a new url, so a re-render alone leaves a failed image failed.
 */
export const ImageRetryContext = createContext<ReadonlyMap<string, number>>(new Map());

export function useImageRetry(id: string): number {
  return useContext(ImageRetryContext).get(id) ?? 0;
}

export function useTrackPendingImage(
  id: string,
  url: string,
  status: 'loading' | 'loaded' | 'failed'
): void {
  const loads = useContext(PendingImagesContext);
  // `use-image` reports 'loading' forever for an empty url — an element with
  // no source has nothing to wait for.
  const state = url === '' || status === 'loaded' ? null : status;
  useEffect(() => {
    if (!loads || !state) return undefined;
    (state === 'loading' ? loads.pending : loads.failed).add(id);
    return () => {
      // Both sets: a retry moves a failed id to `pending` before the element
      // re-renders, and an element removed meanwhile must not stay pending.
      loads.pending.delete(id);
      loads.failed.delete(id);
    };
  }, [loads, id, state]);
}
