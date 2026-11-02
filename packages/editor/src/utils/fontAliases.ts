// SPDX-License-Identifier: AGPL-3.0-only
import { FONT_FAMILY_ALIASES, aliasFontFamily as aliasReplacedFamily } from '@ggraphic/core';

import { declaredFontFamilies } from '../brand/brandRegistry.js';

export { FONT_FAMILY_ALIASES };

/**
 * A single family mapped to its current family. A family a registered brand
 * pack declares stays as it is: the host ships that font, so the alias would
 * only swap it for one the host does not load.
 */
export function aliasFontFamily(family: string): string {
  return declaredFontFamilies().has(family) ? family : aliasReplacedFamily(family);
}

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
      const target = aliasFontFamily(bare);
      if (target === bare) return part;
      return trimmed === bare ? target : `"${target}"`;
    })
    .join(',');
}
