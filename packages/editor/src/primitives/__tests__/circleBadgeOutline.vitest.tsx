// SPDX-License-Identifier: AGPL-3.0-only
import { render } from '@testing-library/react';
import type Konva from 'konva';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage.js';
import { CircleBadge } from '../CircleBadge.js';

import type { CircleBadgeInstance } from '@ggraphic/core';

const noop = () => {};

function mountBadge(outline?: CircleBadgeInstance['outline']) {
  const ref = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={ref} width={600} height={600} responsive={false}>
      <CircleBadge
        id="b"
        x={300}
        y={300}
        radius={100}
        backgroundColor="#ff0000"
        textColor="#000000"
        rotation={0}
        scale={1}
        textLines={[]}
        outline={outline}
        selected={false}
        onSelect={noop}
        onDragEnd={noop}
        onTransformEnd={noop}
        onSnapChange={noop}
        onSnapLinesChange={noop}
        getSnapTargets={() => []}
        stageWidth={600}
        stageHeight={600}
      />
    </CanvasStage>
  );
  const group = ref.current!.getStage()!.findOne('Group') as Konva.Group;
  return group.getChildren()[0]!;
}

describe('circle badge outline', () => {
  it('draws a circle without an outline and for "circle"', () => {
    for (const outline of [undefined, 'circle'] as const) {
      const shape = mountBadge(outline);
      expect(shape.getClassName()).toBe('Circle');
      expect((shape as Konva.Circle).radius()).toBe(100);
    }
  });

  it('draws a burst of 16 points inside the radius', () => {
    const shape = mountBadge('burst') as Konva.Star;
    expect(shape.getClassName()).toBe('Star');
    expect(shape.numPoints()).toBe(16);
    expect(shape.outerRadius()).toBe(100);
    expect(shape.innerRadius()).toBeCloseTo(80);
  });

  it('draws an ellipse wider than the radius and flatter', () => {
    const shape = mountBadge('ellipse') as Konva.Ellipse;
    expect(shape.getClassName()).toBe('Ellipse');
    expect(shape.radiusX()).toBeCloseTo(130);
    expect(shape.radiusY()).toBeCloseTo(78);
  });
});
