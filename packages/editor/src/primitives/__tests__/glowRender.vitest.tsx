// SPDX-License-Identifier: MPL-2.0
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage.js';
import { ShapePrimitive } from '../ShapePrimitive.js';
import { createShape, type ShapeInstance } from '../../utils/shapes.js';

function alphaAt(shape: ShapeInstance, points: Array<[number, number]>): number[] {
  const ref = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={ref} width={300} height={150} responsive={false}>
      <ShapePrimitive shape={shape} isSelected={false} onSelect={() => {}} onChange={() => {}} />
    </CanvasStage>
  );
  const stage = ref.current!.getStage()!;
  act(() => {
    stage.draw();
  });
  const layer = stage.getLayers()[0]!;
  const ratio = layer.getCanvas().getPixelRatio();
  const raw = (layer.getCanvas()._canvas as HTMLCanvasElement).getContext('2d')!;
  return points.map(([x, y]) => raw.getImageData(x * ratio, y * ratio, 1, 1).data[3]!);
}

describe('glow shape', () => {
  const glow: ShapeInstance = {
    ...createShape('ellipse', 150, 75, '#D4146E', '#D4146E'),
    id: 'g',
    width: 240,
    height: 120,
    glow: true,
  };

  it('is opaque in the middle and fades out towards the edge, on both axes', () => {
    const [centre, nearX, nearY, outside] = alphaAt(glow, [
      [150, 75],
      [150 + 100, 75],
      [150, 75 + 50],
      [150 + 119, 75 + 59],
    ]);
    expect(centre).toBeGreaterThan(240);
    expect(nearX).toBeLessThan(centre! / 2);
    // The short axis fades over its own, shorter reach: elliptical, not circular.
    expect(nearY).toBeLessThan(centre! / 2);
    expect(outside).toBeLessThan(5);
  });

  it('paints nothing beyond the ellipse', () => {
    expect(alphaAt(glow, [[150 + 130, 75]])[0]).toBe(0);
  });

  it('leaves a plain ellipse a solid disc', () => {
    expect(alphaAt({ ...glow, glow: undefined }, [[150 + 100, 75]])[0]).toBeGreaterThan(250);
  });
});
