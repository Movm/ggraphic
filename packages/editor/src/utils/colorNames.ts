// SPDX-License-Identifier: MPL-2.0
import { messages } from '@ggraphic/editor/i18n/messages';
import { brandColors } from '@ggraphic/editor/utils/colorOptions';

/** Name of a brand colour, otherwise "Farbe #RRGGBB" (catalogue) — for swatch `aria-label`s. */
export function colorName(hex: string): string {
  const brand = brandColors().find((c) => c.value.toLowerCase() === hex.toLowerCase());
  return brand ? brand.name : messages().common.colorHex(hex.toUpperCase());
}
