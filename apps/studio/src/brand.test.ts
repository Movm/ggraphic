// SPDX-License-Identifier: AGPL-3.0-only
import { resolveRef, type BrandSwatch } from '@ggraphic/core';
import { describe, expect, it } from 'vitest';

import { studioBrand } from './brand';

const lists: Record<string, readonly BrandSwatch[]> = {
  palette: studioBrand.palette,
  textPalette: studioBrand.textPalette,
  'markers.swatches': studioBrand.markers.swatches,
};
const roleColours = Object.values(studioBrand.colors).map((c) => c.toLowerCase());
const isPureBlackOrWhite = (color: string) => /^#(000000|ffffff)$/i.test(color);

describe('the studio brand swatches', () => {
  it.each(Object.entries(lists))(
    '%s: a swatch in a role colour carries that role',
    (name, list) => {
      for (const swatch of list) {
        // Pure black and white stay unbound, except white as text on dark.
        const unbound = isPureBlackOrWhite(swatch.color) && name !== 'textPalette';
        if (roleColours.includes(swatch.color.toLowerCase()) && !unbound) {
          expect(swatch.ref, `${name}/${swatch.id}`).toBeDefined();
        }
        if (swatch.ref) {
          expect(resolveRef(swatch.ref, studioBrand, null)?.toLowerCase(), swatch.id).toBe(
            swatch.color.toLowerCase()
          );
        }
      }
    }
  );

  it('binds text white and wine to the text roles', () => {
    const ref = (id: string) => studioBrand.textPalette.find((s) => s.id === id)?.ref;
    expect(ref('white')).toBe('brand.textOnDark');
    expect(ref('wine')).toBe('brand.textOnLight');
  });

  it('leaves pure black and white unbound in the palette', () => {
    expect(studioBrand.palette.find((s) => s.id === 'black')?.ref).toBeUndefined();
    expect(studioBrand.palette.find((s) => s.id === 'white')?.ref).toBeUndefined();
  });
});
