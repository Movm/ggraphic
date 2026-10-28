// SPDX-License-Identifier: MPL-2.0
import { brandColors } from '@ggraphic/editor/utils/colorOptions';

/** Name of a brand colour, otherwise "Colour #RRGGBB" — for swatch `aria-label`s. */
export function colorName(hex: string): string {
  const brand = brandColors().find((c) => c.value.toLowerCase() === hex.toLowerCase());
  return brand ? brand.name : `Colour ${hex.toUpperCase()}`;
}
