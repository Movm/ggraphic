// SPDX-License-Identifier: AGPL-3.0-only
import { parseColor } from './color.js';

/**
 * Two-colour duotone ramp, the canvas twin of the prototype's CSS
 * (`grayscale contrast(1.15) brightness(1.05)` multiplied onto the high colour,
 * then lightened against the low colour): per channel `max(low, high * g)`
 * with `g = clamp01(((L / 255 - 0.5) * 1.15 + 0.5) * 1.05)`.
 * 256 RGB entries, indexed by the photo's luma byte. An unparsable colour
 * falls back to black (low) or white (high).
 */
export function duotoneRamp(low: string, high: string): Uint8ClampedArray {
  const lo = parseColor(low) ?? { r: 0, g: 0, b: 0, a: 1 };
  const hi = parseColor(high) ?? { r: 255, g: 255, b: 255, a: 1 };
  const loC = [lo.r, lo.g, lo.b];
  const hiC = [hi.r, hi.g, hi.b];
  const ramp = new Uint8ClampedArray(256 * 3);
  for (let l = 0; l < 256; l++) {
    const g = Math.min(1, Math.max(0, ((l / 255 - 0.5) * 1.15 + 0.5) * 1.05));
    for (let k = 0; k < 3; k++) {
      ramp[l * 3 + k] = Math.max(loC[k]!, hiC[k]! * g);
    }
  }
  return ramp;
}
