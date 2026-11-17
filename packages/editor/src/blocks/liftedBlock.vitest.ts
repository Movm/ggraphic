// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { createPillBadgeInstance } from '../utils/pillBadgeUtils.js';

import { boundsOf, translateBlock, type LiftedBlock } from './liftedBlock.js';

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

describe('boundsOf', () => {
  const empty = {
    additionalTexts: [],
    shapeInstances: [],
    assetInstances: [],
    chartInstances: [],
    userImageInstances: [],
    pillBadgeInstances: [],
    circleBadgeInstances: [],
    selectedIcons: [],
    iconStates: {},
    layerOrder: [],
  } satisfies Omit<LiftedBlock, 'bounds' | 'blockRef' | 'brandScheme'>;
  const at = (blockPill: Parameters<typeof createPillBadgeInstance>[1]) =>
    createPillBadgeInstance('slider', blockPill);

  it('measures a pill badge as the box it draws, from its top-left corner', () => {
    const pill = at({ x: 100, y: 200, scale: 2 });
    const bounds = boundsOf({ ...empty, pillBadgeInstances: [pill], layerOrder: [pill.id] });

    expect(bounds.x).toBe(100);
    expect(bounds.y).toBe(200);
    // A block of boxed lines is only pills: it must not collapse to a point.
    expect(bounds.width).toBeGreaterThan(pill.paddingX * 2 * pill.scale);
    expect(bounds.height).toBe((pill.fontSize + pill.paddingY * 2) * pill.scale);
  });

  it('spans every boxed line of a block, not just the first corner', () => {
    const upper = at({ x: 50, y: 100 });
    const lower = at({ x: 90, y: 100 + upper.fontSize + upper.paddingY * 2 + 10 });
    const bounds = boundsOf({
      ...empty,
      pillBadgeInstances: [upper, lower],
      layerOrder: [upper.id, lower.id],
    });

    expect(bounds.x).toBe(50);
    expect(bounds.y).toBe(100);
    expect(bounds.height).toBe(lower.y - upper.y + lower.fontSize + lower.paddingY * 2);
    // The lower line starts further right and reaches past its own padding.
    expect(bounds.width).toBeGreaterThan(lower.x - upper.x + lower.paddingX * 2);
  });

  it('still takes round badges and emoji as points', () => {
    const bounds = boundsOf({
      ...empty,
      assetInstances: [{ id: 'a', x: 10, y: 20 }] as unknown as LiftedBlock['assetInstances'],
      circleBadgeInstances: [
        { id: 'c', x: 60, y: 80 },
      ] as unknown as LiftedBlock['circleBadgeInstances'],
    });
    expect(bounds).toEqual({ x: 10, y: 20, width: 50, height: 60 });
  });
});
