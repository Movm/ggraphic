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
  src: 'https://assets.test/p.jpg',
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

function mountImage(userImage: UserImageInstance) {
  const ref = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={ref} width={800} height={600} responsive={false}>
      <UserImagePrimitive
        userImage={userImage}
        brandScheme={null}
        isSelected={false}
        onSelect={() => {}}
        onDragEnd={() => {}}
        onTransformEnd={() => {}}
        stageWidth={1000}
      />
    </CanvasStage>
  );
  return ref.current!.getStage()!;
}

describe('photo corner radius', () => {
  it('rounds only the corners named, in CSS order (tl, tr, br, bl)', async () => {
    mockImages();
    const stage = mountImage(photo({ cornerRadius: [0, 0, 0, 64] }));
    await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
    expect(stage.findOne<Konva.Image>('.user-photo')!.cornerRadius()).toEqual([0, 0, 0, 64]);
  });

  it('takes one number for all four corners', async () => {
    mockImages();
    const stage = mountImage(photo({ cornerRadius: 32 }));
    await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
    expect(stage.findOne<Konva.Image>('.user-photo')!.cornerRadius()).toBe(32);
  });

  it('stays square without one', async () => {
    mockImages();
    const plain = mountImage(photo());
    await waitFor(() => expect(plain.findOne('.user-photo')).toBeTruthy());
    expect(plain.findOne<Konva.Image>('.user-photo')!.cornerRadius()).toBe(0);
  });

  it('keeps the empty slot in the same shape', async () => {
    mockImages();
    const stage = mountImage(photo({ src: '', cornerRadius: [40, 0, 0, 0] }));
    await waitFor(() => expect(stage.findOne('.export-hidden')).toBeTruthy());
    const hidden = stage.findOne<Konva.Group>('.export-hidden')!;
    expect(hidden.findOne<Konva.Rect>('Rect')!.cornerRadius()).toEqual([40, 0, 0, 0]);
  });
});

describe('rounded-rect shape corner radius', () => {
  const shape = (cornerRadius: ShapeInstance['cornerRadius']): ShapeInstance => ({
    ...createShape('rounded-rect', 100, 50, '#0000FF', '#0000FF'),
    id: 'r',
    width: 200,
    height: 100,
    cornerRadius,
  });

  function mountShape(s: ShapeInstance) {
    const ref = createRef<CanvasStageRef>();
    render(
      <CanvasStage ref={ref} width={300} height={150} responsive={false}>
        <ShapePrimitive
          shape={s}
          isSelected={false}
          onSelect={() => {}}
          onChange={() => {}}
          stageWidth={1000}
        />
      </CanvasStage>
    );
    return ref.current!.getStage()!;
  }

  it('passes a four-value radius to the rect', () => {
    const stage = mountShape(shape([40, 0, 0, 0]));
    expect(stage.findOne<Konva.Rect>('Rect')!.cornerRadius()).toEqual([40, 0, 0, 0]);
  });

  it('still takes a plain number', () => {
    const stage = mountShape(shape(12));
    expect(stage.findOne<Konva.Rect>('Rect')!.cornerRadius()).toBe(12);
  });
});
