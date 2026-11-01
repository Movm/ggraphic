// SPDX-License-Identifier: MPL-2.0
import { brandDefault, type BrandPack } from '@ggraphic/core';
import { describe, expect, it } from 'vitest';

import { ALL_PALETTE_SHAPES, getShapeVariant } from '../ShapesSection.js';

const SWATCHES = [
  { id: 'one', label: 'One', color: '#111111' },
  { id: 'two', label: 'Two', color: '#222222' },
  { id: 'three', label: 'Three', color: '#333333' },
];

const tileColours = (brand: BrandPack, count: number) =>
  ALL_PALETTE_SHAPES.filter((s) => !s.id.startsWith('hand-marker'))
    .slice(0, count)
    .map((s) => getShapeVariant(s.id, brand).color);

describe('shape tiles', () => {
  it('cycle through the palette ids a pack names, in its order', () => {
    const pack: BrandPack = { ...brandDefault, palette: SWATCHES, shapeCycle: ['three', 'one'] };
    expect(tileColours(pack, 4)).toEqual(['#333333', '#111111', '#333333', '#111111']);
  });

  it('cycle through the colour roles without a shapeCycle', () => {
    const { colors } = brandDefault;
    expect(tileColours(brandDefault, 2)).toEqual([colors.primary, colors.secondary]);
  });

  it('fall back to the roles when no named id is in the palette', () => {
    const pack: BrandPack = { ...brandDefault, shapeCycle: ['missing'] };
    expect(tileColours(pack, 1)).toEqual([brandDefault.colors.primary]);
  });
});
