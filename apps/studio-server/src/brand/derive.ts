// SPDX-License-Identifier: AGPL-3.0-only
import { deriveBrandColors, deriveGrounds } from '@ggraphic/core';
import { type BrandSettings, brandSettingsBody } from '../contract.ts';

type Input = Pick<BrandSettings, 'name' | 'fonts' | 'logoAssetId'> & {
  colors: Pick<BrandSettings['colors'], 'primary' | 'secondary' | 'accent'>;
};

/**
 * The full settings stored in `brand_packs` from the three colours a person chose: the other
 * five roles and the grounds are derived, so every column keeps the shape saved designs and
 * `build.ts` rely on. Null when a colour cannot be derived from (the schema rules that out).
 */
export function settingsFromInput({
  name,
  colors,
  fonts,
  logoAssetId,
}: Input): BrandSettings | null {
  const { primary, secondary, accent } = colors;
  const derived = deriveBrandColors({ primary, secondary, accent });
  const grounds = deriveGrounds({ primary, secondary, accent });
  if (!derived || grounds.length === 0) return null;
  // Parsing upper-cases the colours and checks them against the stored shape.
  return brandSettingsBody.parse({
    name,
    colors: derived,
    backgrounds: grounds.map(({ label, color, ink }) => ({ label, color, ink })),
    fonts,
    logoAssetId,
  });
}
