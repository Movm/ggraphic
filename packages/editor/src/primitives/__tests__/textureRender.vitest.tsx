// SPDX-License-Identifier: MPL-2.0
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { ShapePrimitive } from '@ggraphic/editor/primitives/ShapePrimitive';
import { createShape, type ShapeInstance } from '@ggraphic/editor/utils/shapes';

/** A 200 × 100 rect whose top-left sits at stage (50, 25). */
const base: ShapeInstance = {
  ...createShape('rect', 150, 75, '#0000FF', '#0000FF'),
  id: 't',
  width: 200,
  height: 100,
};

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
    stage,
    /** rgba at a point given in the rect's own coordinates. */
    at: (x: number, y: number) =>
      Array.from(raw.getImageData((50 + x) * ratio, (25 + y) * ratio, 1, 1).data),
  };
}

describe('dot pattern', () => {
  const dots: ShapeInstance = {
    ...base,
    pattern: 'dots',
    patternColor: '#FF0000',
    patternSpacing: 0.04,
  };

  it('paints a dot over the fill at the grid centre and leaves the gaps alone', () => {
    const { at } = mount(dots);
    expect(at(20, 20)).toEqual([255, 0, 0, 255]);
    expect(at(40, 40)).toEqual([0, 0, 255, 255]);
  });

  it('is cut to the notch', () => {
    const { at } = mount({ ...dots, notch: 0.1 });
    // A dot centre inside the cut corner: neither fill nor dot.
    expect(at(170, 20)[3]).toBe(0);
    expect(at(20, 20)).toEqual([255, 0, 0, 255]);
  });

  it('adds a second node over the fill, not inside it', () => {
    const { stage } = mount(dots);
    const names = stage
      .find('Shape')
      .map((n) => n.name())
      .filter((n) => n.startsWith('shape-'));
    expect(names).toEqual(['shape-t', 'shape-texture-t-dots']);
  });
});

describe('stripe pattern', () => {
  // 40 px bands on the 1000 px stage: fill first, then the stripe colour, alternating.
  const stripes: ShapeInstance = {
    ...base,
    pattern: 'stripes',
    patternColor: '#FF0000',
    patternSpacing: 0.04,
  };

  it('alternates bands of fill and stripe colour from the left edge', () => {
    const { at } = mount(stripes);
    expect(at(20, 50)).toEqual([0, 0, 255, 255]);
    expect(at(60, 50)).toEqual([255, 0, 0, 255]);
    expect(at(100, 50)).toEqual([0, 0, 255, 255]);
    expect(at(140, 50)).toEqual([255, 0, 0, 255]);
  });

  it('is cut to the notch and sits in a second node over the fill', () => {
    const { at, stage } = mount({ ...stripes, notch: 0.1 });
    expect(at(150, 20)[3]).toBe(0);
    expect(at(60, 50)).toEqual([255, 0, 0, 255]);
    const names = stage
      .find('Shape')
      .map((n) => n.name())
      .filter((n) => n.startsWith('shape-'));
    expect(names).toEqual(['shape-t', 'shape-texture-t-dots']);
  });
});

describe('grain', () => {
  const region = (at: (x: number, y: number) => number[]) => {
    const seen = new Set<string>();
    for (let x = 40; x < 60; x++) for (let y = 30; y < 50; y++) seen.add(at(x, y).join());
    return seen.size;
  };

  it('breaks up a flat fill, and a plain rect stays flat', () => {
    expect(region(mount({ ...base, grain: 1 }).at)).toBeGreaterThan(20);
    expect(region(mount(base).at)).toBe(1);
  });

  it('light grain brightens, dark grain darkens', () => {
    const dark = mount({ ...base, grain: 1, grainTone: 'dark' }).at;
    const light = mount({ ...base, grain: 1, grainTone: 'light' }).at;
    const sum = (at: (x: number, y: number) => number[]) => {
      let total = 0;
      for (let x = 40; x < 60; x++) for (let y = 30; y < 50; y++) total += at(x, y)[0]!;
      return total;
    };
    expect(sum(light)).toBeGreaterThan(sum(dark));
  });

  it('is cut to the notch', () => {
    expect(mount({ ...base, grain: 1, notch: 0.1 }).at(170, 20)[3]).toBe(0);
  });
});
