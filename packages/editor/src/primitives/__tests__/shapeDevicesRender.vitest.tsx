// SPDX-License-Identifier: AGPL-3.0-only
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage.js';
import { ShapePrimitive } from '../ShapePrimitive.js';
import { createShape, type ShapeInstance } from '../../utils/shapes.js';

/** Mounts one shape on a 300 × 150 stage and reads pixels at stage coordinates. */
function mount(shape: ShapeInstance) {
  const ref = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={ref} width={300} height={150} responsive={false}>
      <ShapePrimitive
        shape={shape}
        isSelected={false}
        onSelect={() => {}}
        onChange={() => {}}
        stageWidth={1000}
      />
    </CanvasStage>
  );
  const stage = ref.current!.getStage()!;
  act(() => {
    stage.draw();
  });
  const layer = stage.getLayers()[0]!;
  const raw = (layer.getCanvas()._canvas as HTMLCanvasElement).getContext('2d')!;
  const ratio = layer.getCanvas().getPixelRatio();
  return {
    alpha: (x: number, y: number) => raw.getImageData(x * ratio, y * ratio, 1, 1).data[3]!,
    at: (x: number, y: number) => Array.from(raw.getImageData(x * ratio, y * ratio, 1, 1).data),
  };
}

const RED = '#FF0000';

describe('ring', () => {
  // Centre (150, 75), diameter 120: outer radius 60.
  const ring: ShapeInstance = {
    ...createShape('ring', 150, 75, RED, RED),
    id: 'r',
    width: 120,
    height: 120,
  };

  it('is the filled annulus of old documents when no field is set', () => {
    const { alpha } = mount(ring);
    expect(alpha(150, 75)).toBe(0); // hole
    expect(alpha(150 + 48, 75)).toBe(255); // between the inner radius 36 and 60
    expect(alpha(150 + 25, 75)).toBe(0); // inside the 0.3 inner radius
  });

  it('draws a thin full stroke with ringWidth, hole wide open', () => {
    const { alpha } = mount({ ...ring, ringWidth: 8 });
    expect(alpha(150 + 56, 75)).toBe(255);
    expect(alpha(150 + 48, 75)).toBe(0);
    expect(alpha(150, 75)).toBe(0);
  });

  it('draws only the share arc, from twelve o clock clockwise', () => {
    const { alpha } = mount({ ...ring, ringWidth: 12, arc: 0.25 });
    expect(alpha(150 + 54, 75 - 15)).toBe(255); // upper right quarter
    expect(alpha(150 + 54, 75 + 15)).toBe(0); // lower right
    expect(alpha(150 - 54, 75 - 15)).toBe(0); // upper left
  });

  it('draws nothing for an arc of 0', () => {
    const { alpha } = mount({ ...ring, ringWidth: 12, arc: 0 });
    expect(alpha(150 + 54, 75)).toBe(0);
  });
});

describe('line-arrow bend', () => {
  // Shaft from x 70 to 230 at y 40.
  const arrow: ShapeInstance = {
    ...createShape('line-arrow', 150, 40, RED, RED),
    id: 'a',
    width: 160,
    height: 0,
    strokeWidth: 6,
  };

  it('is straight without bend', () => {
    const { alpha } = mount(arrow);
    expect(alpha(150, 40)).toBe(255);
    expect(alpha(150, 88)).toBe(0);
  });

  it('passes through the sagging middle point with bend', () => {
    const { alpha } = mount({ ...arrow, bend: 0.3 });
    expect(alpha(150, 40 + 48)).toBe(255);
    expect(alpha(150, 40)).toBe(0);
  });
});

describe('speech-bubble tail', () => {
  // A 160 × 60 box centred on (150, 45): spans 70..230 × 15..75.
  const box: ShapeInstance = {
    ...createShape('rounded-rect', 150, 45, RED, RED),
    id: 'b',
    width: 160,
    height: 60,
    cornerRadius: 16,
  };

  it('is the plain rounded rect without a tail', () => {
    const { alpha } = mount(box);
    expect(alpha(150, 90)).toBe(0);
    expect(alpha(150, 45)).toBe(255);
  });

  it('adds a tail below the box in the same fill, tip straight out from the base', () => {
    const { at, alpha } = mount({ ...box, tailSide: 'bottom', tailAt: 0.5, tailSize: 30 });
    expect(at(150, 45)).toEqual([255, 0, 0, 255]);
    expect(at(150, 90)).toEqual([255, 0, 0, 255]); // in the tail
    expect(alpha(110, 90)).toBe(0); // beside the tail
    expect(alpha(150, 115)).toBe(0); // beyond the tip
  });

  it('puts the tail on the chosen side', () => {
    const { alpha } = mount({ ...box, tailSide: 'left', tailAt: 0.5, tailSize: 30 });
    expect(alpha(55, 45)).toBe(255);
    expect(alpha(150, 90)).toBe(0);
  });
});
