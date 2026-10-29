// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { translateBlock, type LiftedBlock } from './liftedBlock.js';

const block: LiftedBlock = {
  additionalTexts: [],
  shapeInstances: [
    { id: 's', type: 'rectangle', x: 100, y: 100, width: 40, height: 20, scaleX: 1, scaleY: 1 },
  ] as unknown as LiftedBlock['shapeInstances'],
  assetInstances: [],
  chartInstances: [],
  userImageInstances: [],
  pillBadgeInstances: [],
  circleBadgeInstances: [],
  selectedIcons: [],
  iconStates: {},
  layerOrder: ['s'],
  bounds: { x: 80, y: 90, width: 40, height: 20 },
  blockRef: { id: 'studio-quote/quote-with-name', version: 1 },
  brandScheme: 'light',
};

describe('translateBlock', () => {
  it('keeps the block reference and the world while it moves', () => {
    const moved = translateBlock(block, 10, 20);
    expect(moved.blockRef).toEqual(block.blockRef);
    expect(moved.brandScheme).toBe('light');
    expect(moved.bounds).toMatchObject({ x: 90, y: 110 });
  });
});
