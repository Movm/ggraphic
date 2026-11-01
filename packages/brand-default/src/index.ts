// SPDX-License-Identifier: MPL-2.0
/**
 * The neutral brand, ready to render: core's `brandDefault` with the real cuts of its families
 * declared. The families are open-licensed (SIL OFL 1.1); import `@ggraphic/brand-default/fonts`
 * once to load them, or provide them yourself.
 */
import { brandDefault, type BrandPack } from '@ggraphic/core';

export const defaultBrand: BrandPack = {
  ...brandDefault,
  fonts: {
    ...brandDefault.fonts,
    // What `./fonts` loads: Bricolage Grotesque is upright only, Anton has a single regular face,
    // and Fraunces keeps the editor's built-in entry.
    cuts: {
      'Bricolage Grotesque': { bold: true, italic: false, boldItalic: false },
      'Instrument Sans': { bold: true, italic: true, boldItalic: true },
      Anton: { bold: false, italic: false, boldItalic: false },
    },
  },
};
