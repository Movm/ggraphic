// SPDX-License-Identifier: MPL-2.0
import { type BrandPack } from '@ggraphic/core';

import { registeredBrands } from '@ggraphic/editor/brand/brandRegistry';
import { messages } from '@ggraphic/editor/i18n/messages';
import { brandColors } from '@ggraphic/editor/utils/colorOptions';

/**
 * Name of a brand colour, otherwise "Farbe #RRGGBB" (catalogue) — for swatch `aria-label`s.
 * The document's pack names it first; a colour it lacks (the effect swatches
 * are shared) keeps the name another registered pack gives it.
 */
export function colorName(hex: string, brand: BrandPack): string {
  const value = hex.toLowerCase();
  for (const pack of [brand, ...registeredBrands()]) {
    const match = brandColors(pack).find((c) => c.value.toLowerCase() === value);
    if (match) return match.name;
  }
  return messages().common.colorHex(hex.toUpperCase());
}
