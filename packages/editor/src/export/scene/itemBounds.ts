// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Where an item draws, in page px: the box a picture of that one element has to cover. The ink of
 * each op is `opBounds` (matrix, stroke, clips); what it does not know is a shadow, which reaches
 * past the shape by its offset and three sigma of blur (the reach `writeSvg` gives its filter).
 */
import { clipped, opBounds, transformRect, unionRect, type Rect } from '../pdf/pdfGeometry.js';

import type { SceneItem, SceneOp } from './types.js';

/** The ink and the shadow of `op`, in page px; null when it draws nothing. */
function inkOf(op: SceneOp): Rect | null {
  let ink: Rect | null;
  if (op.kind === 'group') {
    // The children's matrices are absolute; the group's own matrix then moves what they drew.
    let union: Rect | null = null;
    for (const child of op.ops) union = unionRect(union, inkOf(child));
    ink = clipped(union && transformRect(union, op.matrix), op);
  } else {
    ink = opBounds(op);
  }
  if (!ink || !op.shadow) return ink;
  // Blur is the canvas `shadowBlur`: a Gaussian of sigma blur / 2.
  const reach = 1.5 * op.shadow.blur;
  const { offsetX, offsetY } = op.shadow;
  return unionRect(ink, {
    x0: ink.x0 + offsetX - reach,
    y0: ink.y0 + offsetY - reach,
    x1: ink.x1 + offsetX + reach,
    y1: ink.y1 + offsetY + reach,
  });
}

/** The union of everything the item's ops draw, or null when it draws nothing that can be known. */
export function itemBounds(item: SceneItem): Rect | null {
  let union: Rect | null = null;
  for (const op of item.ops) union = unionRect(union, inkOf(op));
  const finite = union && [union.x0, union.y0, union.x1, union.y1].every(Number.isFinite);
  return finite ? union : null;
}
