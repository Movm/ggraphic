// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { base, fill, item, rect, solid, textOp } from './__fixtures__/exportSceneFixture.js';
import { itemBounds } from './itemBounds.js';

import type { ClipPath, SceneOp } from './types.js';

const red = solid('#ff0000');

describe('itemBounds', () => {
  it('is the box of the ink in page px, under the matrix of each op', () => {
    const moved = fill(rect(0, 0, 10, 20), red, { matrix: [2, 0, 0, 3, 100, 50] });
    const other = fill(rect(10, 10, 5, 5), red);

    expect(itemBounds(item('a', null, moved, other))).toEqual({ x0: 10, y0: 10, x1: 120, y1: 110 });
  });

  it('includes half the stroke width, and what a miter can add', () => {
    const stroked: SceneOp = {
      ...fill(rect(10, 10, 20, 20), red),
      mode: 'stroke',
      stroke: { width: 4, cap: 'butt', join: 'round', miterLimit: 10, dash: [], dashOffset: 0 },
    };

    expect(itemBounds(item('a', null, stroked))).toEqual({ x0: 8, y0: 8, x1: 32, y1: 32 });
  });

  it('widens a stroke by the miter limit only for a miter join: round and bevel stay at half the width', () => {
    const stroked = (join: CanvasLineJoin): SceneOp => ({
      ...fill(rect(10, 10, 20, 20), red),
      mode: 'stroke',
      stroke: { width: 4, cap: 'butt', join, miterLimit: 10, dash: [], dashOffset: 0 },
    });

    expect(itemBounds(item('a', null, stroked('round')))).toEqual({ x0: 8, y0: 8, x1: 32, y1: 32 });
    expect(itemBounds(item('a', null, stroked('bevel')))).toEqual({ x0: 8, y0: 8, x1: 32, y1: 32 });
    // The limit is the longest a miter can reach: half the width times the limit, from a corner.
    expect(itemBounds(item('a', null, stroked('miter')))).toEqual({
      x0: -10,
      y0: -10,
      x1: 50,
      y1: 50,
    });
  });

  it('grows by the reach of a shadow, offset and blur', () => {
    const shadowed: SceneOp = {
      ...fill(rect(100, 100, 50, 50), red),
      shadow: { hex: '#000000', alpha: 0.5, blur: 10, offsetX: 6, offsetY: -4 },
    };

    // Sigma 5, so 3 sigma = 15 px around the ink moved by (6, -4).
    expect(itemBounds(item('a', null, shadowed))).toEqual({
      x0: 91,
      y0: 81,
      x1: 171,
      y1: 161,
    });
  });

  it('reaches the children of a group, their shadows too, and moves them by the group', () => {
    const child: SceneOp = {
      ...fill(rect(0, 0, 10, 10), red),
      shadow: { hex: '#000000', alpha: 1, blur: 0, offsetX: 5, offsetY: 5 },
    };
    const group: SceneOp = {
      ...base({ matrix: [1, 0, 0, 1, 100, 0] }),
      kind: 'group',
      ops: [child],
    };

    expect(itemBounds(item('a', null, group))).toEqual({ x0: 100, y0: 0, x1: 115, y1: 15 });
  });

  it('is cut by the clips of an op', () => {
    const clip: ClipPath = {
      matrix: [1, 0, 0, 1, 0, 0],
      commands: rect(0, 0, 30, 30),
      rule: 'nonzero',
    };
    const clippedOp = fill(rect(-100, -100, 400, 400), red, { clips: [clip] });

    expect(itemBounds(item('a', null, clippedOp))).toEqual({ x0: 0, y0: 0, x1: 30, y1: 30 });
  });

  it('covers text from its first x, over its size', () => {
    const bounds = itemBounds(item('a', null, textOp('Hi')));

    expect(bounds).not.toBeNull();
    // Baseline y = 100, size 40: the line sits above the baseline and reaches below it.
    expect(bounds!.x0).toBeLessThan(20);
    expect(bounds!.y0).toBeLessThan(100 - 40);
    expect(bounds!.y1).toBeGreaterThan(100);
  });

  it('is null for an item with nothing to see', () => {
    expect(itemBounds(item('a', null))).toBeNull();
    const nowhere: ClipPath = { matrix: [1, 0, 0, 1, 0, 0], commands: [], rule: 'nonzero' };
    expect(
      itemBounds(item('a', null, fill(rect(0, 0, 5, 5), red, { clips: [nowhere] })))
    ).toBeNull();
  });
});
