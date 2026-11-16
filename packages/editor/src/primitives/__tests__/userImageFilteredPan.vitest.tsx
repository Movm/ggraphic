// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A filtered photo in a frame pans over a copy filtered once (#197): no filter pass per pointer
 * move, and the photo with its filters comes back on release.
 */
import { createCanvas } from '@napi-rs/canvas';
import { act, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage.js';
import { UserImagePrimitive } from '../UserImagePrimitive.js';

beforeEach(() => {
  vi.spyOn(window, 'Image').mockImplementation(function () {
    const image = Object.assign(createCanvas(600, 800), {
      naturalWidth: 600,
      naturalHeight: 800,
      onload: null as (() => void) | null,
    });
    Object.defineProperty(image, 'src', { set: () => queueMicrotask(() => image.onload?.()) });
    return image as unknown as HTMLImageElement;
  });
});
afterEach(() => vi.restoreAllMocks());

// The filtered copy is a jsdom canvas; @napi-rs only draws its own canvases, so hand it the
// backing one (as in cropGhostOverlay.vitest.tsx).
{
  const napiContext = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as {
    drawImage: (source: unknown, ...rest: unknown[]) => void;
  };
  const drawImage = napiContext.drawImage;
  napiContext.drawImage = function (source: unknown, ...rest: unknown[]) {
    const backing =
      source instanceof HTMLCanvasElement
        ? (source.getContext('2d') as unknown as { canvas: unknown }).canvas
        : source;
    drawImage.call(this, backing, ...rest);
  };
}

describe('framed photo pan with a look', () => {
  it('pans the filtered copy without re-caching, and restores photo and filters on release', async () => {
    const cached = new WeakSet<Konva.Image>();
    const cache = vi.spyOn(Konva.Image.prototype, 'cache').mockImplementation(function (
      this: Konva.Image
    ) {
      cached.add(this);
      return this;
    });
    vi.spyOn(Konva.Image.prototype, 'isCached').mockImplementation(function (this: Konva.Image) {
      return cached.has(this);
    });
    vi.spyOn(Konva.Image.prototype, 'clearCache').mockImplementation(function (this: Konva.Image) {
      cached.delete(this);
      return this;
    });
    const ref = createRef<CanvasStageRef>();
    const onCropEnd = vi.fn();
    render(
      <CanvasStage ref={ref} width={800} height={600} responsive={false}>
        <UserImagePrimitive
          userImage={{
            id: 'photo',
            src: 'https://assets.test/photo.jpg',
            fileName: 'photo.jpg',
            x: 50,
            y: 50,
            width: 300,
            height: 300,
            scale: 1,
            rotation: 0,
            opacity: 1,
            fit: 'cover',
            grayscale: true,
          }}
          isSelected
          isCropping
          onSelect={() => {}}
          onDragEnd={() => {}}
          onTransformEnd={() => {}}
          onCropEnd={onCropEnd}
          onCroppingChange={() => {}}
        />
      </CanvasStage>
    );
    const stage = ref.current!.getStage()!;
    await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
    const photo = stage.findOne('.user-photo') as Konva.Image;
    const ghost = stage.findOne('.crop-ghost') as Konva.Image;
    const original = photo.image();
    await waitFor(() => expect(photo.isCached()).toBe(true));
    const fire = (type: string, y: number) =>
      window.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 200, clientY: y })
      );

    act(() => {
      stage.setPointersPositions(new MouseEvent('mousedown', { clientX: 200, clientY: 200 }));
      ghost.startDrag();
      fire('mousemove', 190);
    });
    expect(photo.image()).not.toBe(original);
    expect(photo.filters()).toEqual([]);
    cache.mockClear();
    act(() => {
      for (let y = 185; y > 120; y -= 5) fire('mousemove', y);
    });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(cache).not.toHaveBeenCalled();

    act(() => {
      fire('mouseup', 120);
    });
    expect(photo.image()).toBe(original);
    expect(photo.filters()).toEqual([Konva.Filters.Grayscale]);
    expect(onCropEnd).toHaveBeenCalledTimes(1);
  });
});
