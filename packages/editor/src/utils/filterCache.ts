// SPDX-License-Identifier: AGPL-3.0-only
import { createContext, useContext } from 'react';

/**
 * On a canvas drawn only to be captured once (a gallery or page preview): the output pixels per
 * page pixel of that capture. Null in the editor.
 *
 * A photo's look bitmap (`lookBitmap`) is sized from it: the editor filters at the device ratio,
 * a preview at what it draws or captures, whichever is larger, so a full-size capture (the
 * render gate) stays sharp. Filtering a preview at page size held one frame for 308 ms (a
 * duotone photo at 4x CPU throttling, 01.11.2026).
 */
export const PreviewRenderContext = createContext<number | null>(null);

export function usePreviewCaptureRatio(): number | null {
  return useContext(PreviewRenderContext);
}
