// SPDX-License-Identifier: MPL-2.0
/**
 * Families that were replaced by an open successor. Saved designs and brand
 * packs may still name the old family, so every place that resolves a family
 * for loading, painting, measuring or PPTX export maps it through here. Stored
 * data is never rewritten.
 */
export const FONT_FAMILY_ALIASES: Readonly<Record<string, string>> = {
  'PT Sans': 'Instrument Sans',
  Vollkorn: 'Fraunces',
};

/** A single family name (no CSS stack, no quotes) mapped to its current family. */
export function aliasFontFamily(family: string): string {
  return FONT_FAMILY_ALIASES[family] ?? family;
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
      const target = FONT_FAMILY_ALIASES[bare];
      if (!target) return part;
      return trimmed === bare ? target : `"${target}"`;
    })
    .join(',');
}
