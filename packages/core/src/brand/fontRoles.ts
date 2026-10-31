// SPDX-License-Identifier: MPL-2.0
import { type BrandFontRole, type Bindings, firstFontFamily, resolveRef } from './bindings.js';
import { type BrandPack } from './brandPack.js';

/**
 * The font roles a person picks from, in picker order. The brand's other roles (`quoteShort`,
 * `quoteEmphasis`) are not offered: they are the same families under a different job.
 */
export const FONT_ROLES = [
  'headline',
  'body',
  'condensed',
  'serif',
] as const satisfies readonly BrandFontRole[];

export type FontRole = (typeof FONT_ROLES)[number];

export interface FontRoleOption {
  role: FontRole;
  /** The brand's family for the role, without a fallback tail. */
  family: string;
}

/**
 * The roles a brand offers on a text, in `FONT_ROLES` order, each with the family it stands for
 * now. A role whose family an earlier one already has is left out: a brand without a serif or
 * condensed font answers those roles with its body or headline font, and offering the same
 * font twice under two names would only confuse.
 */
export function fontRoleOptions(brand: BrandPack): FontRoleOption[] {
  const options: FontRoleOption[] = [];
  for (const role of FONT_ROLES) {
    const family = resolveRef(`font.${role}`, brand, null);
    if (family === null || family.trim() === '') continue;
    if (options.some((o) => firstFontFamily(o.family) === firstFontFamily(family))) continue;
    options.push({ role, family });
  }
  return options;
}

/**
 * The offered role a text stands for: the one it is bound to, else the one whose family it
 * uses; null for a family no offered role has. A text bound to a role that is not offered
 * (`quoteEmphasis`, or `condensed` in a brand where it collapsed into the headline font) is
 * matched by the family it uses, which is the family of the role that absorbed it.
 */
export function currentFontRole(
  text: { fontFamily: string; bind?: Bindings },
  options: readonly FontRoleOption[]
): FontRole | null {
  const ref = text.bind?.['fontFamily']?.ref;
  const bound = options.find((o) => `font.${o.role}` === ref);
  if (bound) return bound.role;
  const family = firstFontFamily(text.fontFamily);
  if (family === '') return null;
  return options.find((o) => firstFontFamily(o.family) === family)?.role ?? null;
}
