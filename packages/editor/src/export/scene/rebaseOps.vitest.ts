// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { apply, IDENTITY } from './matrix.js';
import { rebaseOps } from './rebaseOps.js';

import type { ClipPath, SceneOp } from './types.js';

const clip: ClipPath = {
  matrix: [1, 0, 0, 1, 5, 6],
  commands: [{ op: 'M', x: 0, y: 0 }],
  rule: 'nonzero',
};

const square: SceneOp = {
  kind: 'path',
  matrix: [2, 0, 0, 2, 100, 50],
  alpha: 0.5,
  clips: [clip],
  shadow: { hex: '#000000', alpha: 1, blur: 4, offsetX: 3, offsetY: -2 },
  mode: 'fill',
  commands: [{ op: 'M', x: 0, y: 0 }],
  rule: 'nonzero',
  paint: { type: 'solid', hex: '#ff0000', alpha: 1 },
  stroke: null,
};

describe('rebaseOps', () => {
  it('moves matrices and clips to the box and scales them by the ratio', () => {
    const box = { x: 90, y: 40, width: 50, height: 30 };
    const [out] = rebaseOps([square], box, 2) as [typeof square];
    // The op's own origin (100, 50) is at (10, 10) in the box, which is (20, 20) device px.
    expect(apply(out.matrix, 0, 0)).toEqual({ x: 20, y: 20 });
    // Its scale doubles with the ratio.
    expect(out.matrix[0]).toBe(4);
    // The clip's origin (5, 6) is at (-85, -34) in the box, so (-170, -68) device px.
    expect(apply(out.clips[0]!.matrix, 0, 0)).toEqual({ x: -170, y: -68 });
    expect(out.alpha).toBe(0.5);
  });

  it('scales the shadow, which is in device px and which the matrix does not reach', () => {
    const [out] = rebaseOps([square], { x: 0, y: 0, width: 10, height: 10 }, 3);
    expect(out!.shadow).toEqual({ hex: '#000000', alpha: 1, blur: 12, offsetX: 9, offsetY: -6 });
  });

  it('reaches the children of a group and the ops an island was made of', () => {
    const group: SceneOp = {
      kind: 'group',
      matrix: IDENTITY,
      alpha: 1,
      clips: [],
      shadow: null,
      ops: [square],
    };
    const island: SceneOp = {
      kind: 'raster',
      matrix: IDENTITY,
      alpha: 1,
      clips: [],
      shadow: null,
      png: null,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      reason: 'filter',
      source: [square],
    };
    const [g, r] = rebaseOps([group, island], { x: 100, y: 50, width: 10, height: 10 }, 1);
    for (const nested of [g, r]) {
      const child =
        nested!.kind === 'group' ? nested.ops[0]! : (nested as typeof island).source![0]!;
      expect(apply(child.matrix, 0, 0)).toEqual({ x: 0, y: 0 });
    }
  });

  it('leaves its input alone', () => {
    rebaseOps([square], { x: 1, y: 1, width: 1, height: 1 }, 2);
    expect(square.matrix).toEqual([2, 0, 0, 2, 100, 50]);
    expect(square.shadow?.blur).toBe(4);
  });
});
