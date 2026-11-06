// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Moves ops from page px onto a canvas that shows only a box of the page, at a pixel ratio, so
 * `replayScene` can draw them there. Replay sets every op's matrix absolutely, so the move has to
 * be part of the ops: matrix and clip matrices get the box origin and the ratio on top. Shadow
 * blur and offsets are device px (the CTM does not apply to them), so the ratio scales them too.
 *
 * Used by whoever answers a writer's request to raster ops (`WritePdfOptions.rasterize`).
 */
import { multiply } from './matrix.js';

import type { Matrix, SceneOp } from './types.js';

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rebaseOps(ops: readonly SceneOp[], box: PageBox, pixelRatio: number): SceneOp[] {
  const base: Matrix = [pixelRatio, 0, 0, pixelRatio, -box.x * pixelRatio, -box.y * pixelRatio];
  const rebase = (op: SceneOp): SceneOp => {
    const moved = {
      matrix: multiply(base, op.matrix),
      clips: op.clips.map((clip) => ({ ...clip, matrix: multiply(base, clip.matrix) })),
      shadow: op.shadow && {
        ...op.shadow,
        blur: op.shadow.blur * pixelRatio,
        offsetX: op.shadow.offsetX * pixelRatio,
        offsetY: op.shadow.offsetY * pixelRatio,
      },
    };
    switch (op.kind) {
      case 'group':
        return { ...op, ...moved, ops: op.ops.map(rebase) };
      case 'raster':
        return { ...op, ...moved, source: op.source && op.source.map(rebase) };
      default:
        return { ...op, ...moved };
    }
  };
  return ops.map(rebase);
}
