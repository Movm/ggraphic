// SPDX-License-Identifier: AGPL-3.0-only
import { type BrandFontRole } from '@ggraphic/core';
import { activeBrand } from '../brand/brandRegistry.js';

/** Font stacks of the active brand's headline, body and quote families. */
export const headlineFont = () => `${activeBrand().fonts.headline}, Arial, sans-serif`;
export const bodyFont = () => `${activeBrand().fonts.body}, Arial, sans-serif`;
export const quoteFont = () => `${activeBrand().fonts.quoteEmphasis}, Georgia, serif`;

/** The fallbacks behind a bound font role's family, the same as above. */
export const fontFallbackFor = (role: string) =>
  role === 'quoteShort' || role === 'quoteEmphasis' || role === 'serif'
    ? 'Georgia, serif'
    : 'Arial, sans-serif';

/** The stack for a bound font role: the brand's family, then the same fallbacks as above. */
export const fontStackFor = (role: BrandFontRole, family: string) =>
  `${family}, ${fontFallbackFor(role)}`;

/** Type sizes are set for a 1080 px short side and follow the format from there. */
export const scaleFor = (width: number, height: number) => Math.min(width, height) / 1080;
