// SPDX-License-Identifier: AGPL-3.0-only
import { type NodeFrame, normalizeRotation } from './orientation.js';

/** Text of the angle/size badge shown while a Transformer is active; null when nothing to show. */
export function transformHudLabel(
  anchor: string | null,
  frame: NodeFrame,
  logicalScale: number
): string | null {
  if (!anchor) return null;
  if (anchor === 'rotater') return `${normalizeRotation(Math.round(frame.rotation))}°`;
  const w = Math.round((frame.local.width * Math.abs(frame.scaleX)) / logicalScale);
  const h = Math.round((frame.local.height * Math.abs(frame.scaleY)) / logicalScale);
  return `${w} × ${h}`;
}
