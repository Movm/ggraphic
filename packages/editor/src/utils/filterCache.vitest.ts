// SPDX-License-Identifier: MPL-2.0
import Konva from 'konva';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cacheFiltered } from './filterCache';

/** An image whose stage shows the page at `stageScale` (the display scale). */
function imageOnStage(stageScale: number) {
  // The display scale reaches the image through its parents.
  const page = new Konva.Group({ scaleX: stageScale, scaleY: stageScale });
  const image = new Konva.Image({ image: undefined, width: 1080, height: 1350 });
  page.add(image);
  vi.spyOn(image, 'getStage').mockReturnValue({ scaleX: () => stageScale } as never);
  return image;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cacheFiltered', () => {
  it('filters a small preview at the resolution the stage draws, not at page size', () => {
    const image = imageOnStage(0.4);
    const cache = vi.spyOn(image, 'cache').mockReturnThis();
    cacheFiltered(image, 0.1);
    expect(cache).toHaveBeenCalledWith({ pixelRatio: 0.4 * Konva.pixelRatio });
  });

  it('filters at the capture resolution when the preview is captured larger than drawn', () => {
    const image = imageOnStage(0.4);
    const cache = vi.spyOn(image, 'cache').mockReturnThis();
    // A full-size capture (the render gate): one output pixel per page pixel.
    cacheFiltered(image, 1);
    expect(cache).toHaveBeenCalledWith({ pixelRatio: Math.max(0.4 * Konva.pixelRatio, 1) });
  });

  it('keeps the full resolution in the editor, where a zoom must stay sharp', () => {
    const image = imageOnStage(0.4);
    const cache = vi.spyOn(image, 'cache').mockReturnThis();
    cacheFiltered(image, null);
    expect(cache).toHaveBeenCalledWith();
  });
});
