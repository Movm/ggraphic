// SPDX-License-Identifier: AGPL-3.0-only
import { type BrandPack } from '@ggraphic/core';

import { registeredBrands } from '../brand/brandRegistry.js';
import { messages } from '../i18n/catalogue.js';
import { brandColors } from './colorOptions.js';

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
