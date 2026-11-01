// SPDX-License-Identifier: MPL-2.0
import { useCanvasEditorServices } from '../CanvasEditorProvider.js';
import { useCallback } from 'react';

import type { StockImageAttribution } from '../common/imageSourceTypes.js';

/**
 * Unsplash API Terms: every placement of an Unsplash photo pings its
 * `downloadLocation`. Shared by every path that puts a photo on the canvas.
 */
export function useTrackUnsplashDownload() {
  const { trackUnsplashDownloadLive, trackUnsplashDownload } = useCanvasEditorServices();
  return useCallback(
    (filename: string, attribution: StockImageAttribution | undefined) => {
      const downloadLocation = attribution?.downloadLocation;
      if (!downloadLocation) return;
      if (trackUnsplashDownloadLive) void trackUnsplashDownloadLive(downloadLocation);
      else if (trackUnsplashDownload) void trackUnsplashDownload({ filename, attribution });
    },
    [trackUnsplashDownloadLive, trackUnsplashDownload]
  );
}
