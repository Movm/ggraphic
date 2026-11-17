// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Ausschnitt-Modus mit Look: ein gefiltertes Foto filtert beim Ziehen nicht neu (#197). Der Look
 * ist eine Bitmap, die einmal je Look entsteht; Ziehen verschiebt nur den Ausschnitt. Früher lief
 * je Mausschritt ein `cache()` mit allen Filtern über die Pixel.
 */
import { createCanvas } from '@napi-rs/canvas';
import { act, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CanvasImage } from '../CanvasImage.js';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage.js';
import { UserImagePrimitive } from '../UserImagePrimitive.js';
import { installNapiStageBridge } from '../../testing/napiStageBridge.js';
import { CROP_GHOST_NAME } from '../../utils/cropGhost.js';
import { LOOK_IMAGE_ATTR } from '../../utils/lookBitmap.js';
import { USER_PHOTO_NODE_NAME } from '../../utils/userImageUtils.js';

// The look bitmap is a jsdom canvas; drawing it needs the napi canvas behind it.
let restoreBridge: () => void;
beforeAll(() => {
  restoreBridge = installNapiStageBridge();
});
afterAll(() => restoreBridge());
afterEach(() => vi.restoreAllMocks());

const napiContext = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as {
  getImageData: (...args: unknown[]) => unknown;
};

function photo(width: number, height: number): HTMLImageElement {
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').fillRect(0, 0, width, height);
  return Object.assign(canvas, { naturalWidth: width, naturalHeight: height }) as never;
}

/** Drags `node` by moving the pointer from y = 150 through `ys`, and counts filter passes. */
function dragAndCount(stage: Konva.Stage, node: Konva.Node, ys: number[]) {
  const cache = vi.spyOn(Konva.Node.prototype, 'cache');
  const readPixels = vi.spyOn(napiContext, 'getImageData');
  const fire = (type: string, y: number) =>
    window.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 150, clientY: y })
    );
  act(() => {
    stage.setPointersPositions(new MouseEvent('mousedown', { clientX: 150, clientY: 150 }));
    node.startDrag();
    for (const y of ys) fire('mousemove', y);
  });
  const counts = { cache: cache.mock.calls.length, pixelReads: readPixels.mock.calls.length };
  act(() => {
    fire('mouseup', ys[ys.length - 1]!);
  });
  return counts;
}

const MOVES = [145, 140, 130, 120, 110, 100, 90, 80];

describe('a filtered photo in Ausschnitt mode', () => {
  it('pans the background over its look bitmap without filtering again', () => {
    const stageRef = createRef<CanvasStageRef>();
    render(
      <CanvasStage ref={stageRef} width={300} height={300} responsive={false}>
        <CanvasImage
          id="background-image"
          image={photo(400, 800)}
          x={0}
          y={0}
          width={300}
          height={300}
          coverFit
          cropping
          selected
          adjustments={{ grayscale: true, vignette: 0.6 }}
          stageWidth={300}
          stageHeight={300}
          constrainToBounds={false}
          snapToCenter={false}
          onSelect={() => {}}
          onDragEnd={() => {}}
        />
      </CanvasStage>
    );
    const stage = stageRef.current!.getStage()!;
    act(() => stage.draw());
    const node = stage.findOne('#background-image') as Konva.Image;
    const bitmap = node.getAttr(LOOK_IMAGE_ATTR) as unknown;
    expect(bitmap).toBeTruthy();
    expect(stage.findOne(`.${CROP_GHOST_NAME}`)!.getAttr(LOOK_IMAGE_ATTR)).toBe(bitmap);
    const start = node.crop().y;

    const counts = dragAndCount(stage, node, MOVES);

    expect(node.crop().y).not.toBe(start);
    expect(counts).toEqual({ cache: 0, pixelReads: 0 });
    expect(node.getAttr(LOOK_IMAGE_ATTR)).toBe(bitmap);
    expect(node.isCached()).toBe(false);
  });

  it('pans a framed photo over its look bitmap without filtering again', async () => {
    vi.spyOn(window, 'Image').mockImplementation(function () {
      const image = Object.assign(photo(400, 800), {
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
      });
      Object.defineProperty(image, 'src', { set: () => queueMicrotask(() => image.onload?.()) });
      return image as unknown as HTMLImageElement;
    });
    const stageRef = createRef<CanvasStageRef>();
    render(
      <CanvasStage ref={stageRef} width={300} height={300} responsive={false}>
        <UserImagePrimitive
          userImage={{
            id: 'slot',
            src: 'https://assets.test/p.jpg',
            fileName: '',
            x: 0,
            y: 0,
            width: 300,
            height: 300,
            scale: 1,
            rotation: 0,
            opacity: 1,
            fit: 'cover',
            sepia: true,
            flipX: true,
          }}
          brandScheme={null}
          isSelected
          isCropping
          onSelect={() => {}}
          onDragEnd={() => {}}
          onTransformEnd={() => {}}
          stageWidth={300}
        />
      </CanvasStage>
    );
    const stage = stageRef.current!.getStage()!;
    await waitFor(() => expect(stage.findOne(`.${USER_PHOTO_NODE_NAME}`)).toBeTruthy());
    const framed = stage.findOne(`.${USER_PHOTO_NODE_NAME}`) as Konva.Image;
    const ghost = stage.findOne(`.${CROP_GHOST_NAME}`) as Konva.Image;
    await waitFor(() => expect(framed.getAttr(LOOK_IMAGE_ATTR)).toBeTruthy());
    const bitmap = framed.getAttr(LOOK_IMAGE_ATTR) as unknown;
    expect(ghost.getAttr(LOOK_IMAGE_ATTR)).toBe(bitmap);
    const start = framed.crop().y;

    const counts = dragAndCount(stage, ghost, MOVES);

    expect(framed.crop().y).not.toBe(start);
    expect(counts).toEqual({ cache: 0, pixelReads: 0 });
    expect(framed.getAttr(LOOK_IMAGE_ATTR)).toBe(bitmap);
  });
});
