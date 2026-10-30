// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { shadeGradient } from './shade.js';

describe('shadeGradient', () => {
  it('bottom: transparent at the top, 0.82 at 62 %, 0.94 at the bottom edge', () => {
    const g = shadeGradient('#112233', 'bottom');
    expect(g.type).toBe('linear');
    expect(g.angle).toBe(90);
    expect(g.stops).toEqual([
      { offset: 0, color: 'rgba(17, 34, 51, 0)' },
      { offset: 0.62, color: 'rgba(17, 34, 51, 0.82)' },
      { offset: 1, color: 'rgba(17, 34, 51, 0.94)' },
    ]);
  });

  it('top: 0.88 at the top edge, 0.6 at 55 %, transparent at the bottom', () => {
    const g = shadeGradient('#112233', 'top');
    expect(g.angle).toBe(90);
    expect(g.stops).toEqual([
      { offset: 0, color: 'rgba(17, 34, 51, 0.88)' },
      { offset: 0.55, color: 'rgba(17, 34, 51, 0.6)' },
      { offset: 1, color: 'rgba(17, 34, 51, 0)' },
    ]);
  });

  it('keeps the colour of fill in every stop, for hex with and without alpha input', () => {
    for (const fill of ['#112233', '#123', '#11223380', 'rgb(17, 34, 51)', 'rgba(17,34,51,0.3)']) {
      for (const dir of ['bottom', 'top'] as const) {
        for (const stop of shadeGradient(fill, dir).stops) {
          expect(stop.color).toMatch(/^rgba\(17, 34, 51, [\d.]+\)$/);
        }
      }
    }
  });
});
