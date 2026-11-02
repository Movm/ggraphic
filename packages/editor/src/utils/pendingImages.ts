// SPDX-License-Identifier: MPL-2.0
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
    const set = state === 'loading' ? loads.pending : loads.failed;
    set.add(id);
    return () => {
      set.delete(id);
    };
  }, [loads, id, state]);
}
