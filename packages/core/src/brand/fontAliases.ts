// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Families that were replaced by an open successor. Saved designs and brand
 * packs may still name the old family; everything that loads, paints, measures
 * or exports a family maps it through here. Stored data is never rewritten.
 */
export const FONT_FAMILY_ALIASES: Readonly<Record<string, string>> = {
  'PT Sans': 'Instrument Sans',
  Vollkorn: 'Fraunces',
};

/** A single family name (no CSS stack, no quotes) mapped to its current family. */
export function aliasFontFamily(family: string): string {
  return FONT_FAMILY_ALIASES[family] ?? family;
}
