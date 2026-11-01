// SPDX-License-Identifier: MPL-2.0
import Konva from 'konva';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cacheFiltered } from './filterCache';

function imageOnStage(scale: number) {
  // The stage's display scale reaches the image through its parents.
  const page = new Konva.Group({ scaleX: scale, scaleY: scale });
  const image = new Konva.Image({ image: undefined, width: 1080, height: 1350 });
  page.add(image);
  return image;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cacheFiltered', () => {
  it('filters a preview at the resolution the stage draws, not at page size', () => {
    const image = imageOnStage(0.4);
    const cache = vi.spyOn(image, 'cache').mockReturnThis();
    cacheFiltered(image, true);
    expect(cache).toHaveBeenCalledWith({ pixelRatio: 0.4 * Konva.pixelRatio });
  });

  it('keeps the full resolution in the editor, where a zoom must stay sharp', () => {
    const image = imageOnStage(0.4);
    const cache = vi.spyOn(image, 'cache').mockReturnThis();
    cacheFiltered(image, false);
    expect(cache).toHaveBeenCalledWith();
  });
});
