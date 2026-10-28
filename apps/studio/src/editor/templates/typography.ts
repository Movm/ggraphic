// SPDX-License-Identifier: AGPL-3.0-only
import { studioBrand } from '../../brand';

/** Font stacks of the neutral brand; the families are bundled (OFL) by `src/fonts.ts`. */
export const headlineFont = () => `${studioBrand.fonts.headline}, Arial, sans-serif`;
export const bodyFont = () => `${studioBrand.fonts.body}, Arial, sans-serif`;
export const quoteFont = () => `${studioBrand.fonts.quoteEmphasis}, Georgia, serif`;

/** Type sizes are set for a 1080 px short side and follow the format from there. */
export const scaleFor = (width: number, height: number) => Math.min(width, height) / 1080;
