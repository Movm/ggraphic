// SPDX-License-Identifier: MPL-2.0
import { FONT_FAMILY_ALIASES, aliasFontFamily } from '@ggraphic/core';

export { FONT_FAMILY_ALIASES, aliasFontFamily };

/**
 * A family name or CSS stack ("PT Sans, Arial, sans-serif") with every
 * aliased entry replaced. Unknown families and the fallback entries pass
 * through unchanged.
 */
export function resolveFontFamily(fontFamily: string): string {
  if (!fontFamily) return fontFamily;
  return fontFamily
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      const bare = trimmed.replace(/^['"]|['"]$/g, '');
      const target = FONT_FAMILY_ALIASES[bare];
      if (!target) return part;
      return trimmed === bare ? target : `"${target}"`;
    })
    .join(',');
}
