// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { duotoneRamp } from './duotone';

const at = (ramp: Uint8ClampedArray, l: number) => [ramp[l * 3], ramp[l * 3 + 1], ramp[l * 3 + 2]];

describe('duotoneRamp', () => {
  it('has 256 RGB entries', () => {
    expect(duotoneRamp('#102030', '#f0e0d0').length).toBe(768);
  });

  it('maps luma 0 to the low colour', () => {
    expect(at(duotoneRamp('#102030', '#f0e0d0'), 0)).toEqual([0x10, 0x20, 0x30]);
  });

  it('maps luma 255 to the high colour (clamped)', () => {
    // g = (0.5 * 1.15 + 0.5) * 1.05 = 1.130 -> clamped to 1.
    expect(at(duotoneRamp('#102030', '#f0e0d0'), 255)).toEqual([0xf0, 0xe0, 0xd0]);
  });

  it('is max(low, high * g) per channel at a mid grey', () => {
    const l = 128;
    const g = Math.min(1, ((l / 255 - 0.5) * 1.15 + 0.5) * 1.05);
    const [lr, lg, lb] = [200, 10, 10];
    const [hr, hg, hb] = [100, 200, 255];
    const ramp = duotoneRamp('#c80a0a', '#64c8ff');
    expect(at(ramp, l)).toEqual([
      Math.round(Math.max(lr, hr * g)),
      Math.round(Math.max(lg, hg * g)),
      Math.round(Math.max(lb, hb * g)),
    ]);
    // The low colour wins in the red channel: it is brighter than the scaled high.
    expect(ramp[l * 3]).toBe(200);
  });

  it('falls back to black and white for an invalid colour instead of throwing', () => {
    const ramp = duotoneRamp('nope', '???');
    expect(at(ramp, 0)).toEqual([0, 0, 0]);
    expect(at(ramp, 255)).toEqual([255, 255, 255]);
  });
});
