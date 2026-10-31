// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { BINDABLE_FIELDS } from '../../brand/bindableFields.js';
import { dotCenters, grainTile } from '../grain.js';

describe('grainTile', () => {
  it('is identical on two calls and differs for another seed', () => {
    expect(grainTile(1, 256)).toEqual(grainTile(1, 256));
    expect(grainTile(2, 256)).not.toEqual(grainTile(1, 256));
  });

  it('is 256 × 256 RGBA with a visible mean alpha', () => {
    const tile = grainTile(1, 256);
    expect(tile).toHaveLength(256 * 256 * 4);
    let sum = 0;
    for (let i = 3; i < tile.length; i += 4) sum += tile[i]!;
    const mean = sum / (256 * 256);
    expect(mean).toBeGreaterThan(40);
    expect(mean).toBeLessThan(90);
  });

  it('draws dark specks black and light specks white', () => {
    expect(Array.from(grainTile(1, 4, 'dark').slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(grainTile(1, 4, 'light').slice(0, 3))).toEqual([255, 255, 255]);
  });
});

describe('dotCenters', () => {
  it('lays a grid offset by half the spacing', () => {
    expect(dotCenters(40, 20, 20)).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ]);
  });

  it('draws nothing for a zero spacing', () => {
    expect(dotCenters(100, 100, 0)).toEqual([]);
  });
});

describe('pattern colour', () => {
  it('follows the brand: patternColor is bindable on shapes', () => {
    expect(BINDABLE_FIELDS.shapeInstances).toContain('patternColor');
  });
});
