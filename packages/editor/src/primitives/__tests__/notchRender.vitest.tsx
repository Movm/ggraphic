// SPDX-License-Identifier: MPL-2.0
import { createCanvas } from '@napi-rs/canvas';
import { render, waitFor } from '@testing-library/react';
import type Konva from 'konva';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage.js';
import { ShapePrimitive } from '../ShapePrimitive.js';
import { UserImagePrimitive } from '../UserImagePrimitive.js';
import { createShape, type ShapeInstance } from '../../utils/shapes.js';

import type { UserImageInstance } from '../../utils/userImageUtils.js';

afterEach(() => vi.restoreAllMocks());

function mockImages() {
  vi.spyOn(window, 'Image').mockImplementation(function () {
    const image = Object.assign(createCanvas(600, 400), {
      naturalWidth: 600,
      naturalHeight: 400,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
    });
    Object.defineProperty(image, 'src', {
      set: () => queueMicrotask(() => image.onload?.()),
    });
    return image as unknown as HTMLImageElement;
  });
}

const photo = (extra: Partial<UserImageInstance> = {}): UserImageInstance => ({
  id: 'slot',
  src: '',
  fileName: '',
  x: 50,
  y: 80,
  width: 600,
  height: 400,
  scale: 1,
  rotation: 0,
  opacity: 1,
  fit: 'cover',
  ...extra,
});

/** Runs a node's clipFunc against a recording context and returns the traced points. */
function clipPoints(group: Konva.Group): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const ctx = {
    beginPath: () => {},
    closePath: () => {},
    moveTo: (x: number, y: number) => points.push([x, y]),
    lineTo: (x: number, y: number) => points.push([x, y]),
  };
  (group.clipFunc() as (c: unknown) => void)(ctx);
  return points;
}

function mountImage(userImage: UserImageInstance) {
  const ref = createRef<CanvasStageRef>();
  const ui = (u: UserImageInstance) => (
    <CanvasStage ref={ref} width={800} height={600} responsive={false}>
      <UserImagePrimitive
        userImage={u}
        brandScheme={null}
        isSelected={false}
        onSelect={() => {}}
        onDragEnd={() => {}}
        onTransformEnd={() => {}}
        stageWidth={1000}
      />
    </CanvasStage>
  );
  const view = render(ui(userImage));
  return {
    stage: ref.current!.getStage()!,
    rerender: (u: UserImageInstance) => view.rerender(ui(u)),
  };
}

describe('notched image', () => {
  it('clips the photo to the notch outline', async () => {
    mockImages();
    const { stage } = mountImage(photo({ src: 'https://assets.test/p.jpg', notch: 0.05 }));
    await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
    const clip = stage.findOne<Konva.Group>('.notch-clip')!;
    expect(clip.findOne('.user-photo')).toBeTruthy();
    expect(clipPoints(clip)).toEqual([
      [0, 0],
      [550, 0],
      [550, 50],
      [600, 50],
      [600, 400],
      [0, 400],
    ]);
  });

  it('follows the frame after a resize', async () => {
    mockImages();
    const { stage, rerender } = mountImage(
      photo({ src: 'https://assets.test/p.jpg', notch: 0.05 })
    );
    await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
    rerender(photo({ src: 'https://assets.test/p.jpg', notch: 0.05, width: 300, height: 200 }));
    expect(clipPoints(stage.findOne<Konva.Group>('.notch-clip')!)[4]).toEqual([300, 200]);
  });

  it('clips the empty-slot placeholder too, and notch wins over the circle mask', async () => {
    mockImages();
    const { stage } = mountImage(photo({ notch: 0.05, mask: 'kreis' }));
    await waitFor(() => expect(stage.findOne('.export-hidden')).toBeTruthy());
    const clip = stage.findOne<Konva.Group>('.notch-clip')!;
    expect(clipPoints(clip)[1]).toEqual([550, 0]);
    expect(clip.findOne<Konva.Rect>('Rect')!.cornerRadius()).toBe(0);
  });

  it('draws no clip without a notch', async () => {
    mockImages();
    const { stage } = mountImage(photo({ src: 'https://assets.test/p.jpg' }));
    await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
    expect(stage.findOne('.notch-clip')).toBeUndefined();
  });
});

describe('notched rect', () => {
  const rect = (extra: Partial<ShapeInstance> = {}): ShapeInstance => ({
    ...createShape('rect', 300, 200, '#1D3557', '#1D3557'),
    id: 'r',
    width: 200,
    height: 100,
    ...extra,
  });

  function mountRect(shape: ShapeInstance) {
    const ref = createRef<CanvasStageRef>();
    render(
      <CanvasStage ref={ref} width={800} height={600} responsive={false}>
        <ShapePrimitive
          shape={shape}
          isSelected={false}
          onSelect={() => {}}
          onChange={() => {}}
          stageWidth={1000}
        />
      </CanvasStage>
    );
    return ref.current!.getStage()!;
  }

  it('paints along the notch outline and keeps its box and fill', () => {
    const stage = mountRect(rect({ notch: 0.05 }));
    const node = stage.findOne<Konva.Shape>('.shape-r')!;
    expect(node.getClassName()).toBe('Shape');
    expect([node.width(), node.height(), node.fill()]).toEqual([200, 100, '#1D3557']);
    expect([node.offsetX(), node.offsetY()]).toEqual([100, 50]);
    const path: Array<[number, number]> = [];
    const ctx = Object.assign(Object.create(null), {
      beginPath: () => {},
      closePath: () => {},
      moveTo: (x: number, y: number) => path.push([x, y]),
      lineTo: (x: number, y: number) => path.push([x, y]),
      fillStrokeShape: () => {},
    });
    node.sceneFunc().call(node, ctx, node);
    expect(path[1]).toEqual([150, 0]);
    expect(path[2]).toEqual([150, 50]);
  });

  it('stays a plain Rect without a notch', () => {
    const stage = mountRect(rect());
    expect(stage.findOne('.shape-r')!.getClassName()).toBe('Rect');
  });
});
