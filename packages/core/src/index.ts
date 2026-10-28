// SPDX-License-Identifier: MPL-2.0
export { FONT_FAMILY_ALIASES, aliasFontFamily } from './brand/fontAliases.js';
export { brandDefault } from './brand/brandDefault.js';
export {
  type BrandBackground,
  type BrandColors,
  type BrandEffects,
  type BrandFontFace,
  type BrandFonts,
  type BrandImage,
  type BrandPack,
  type BrandSwatch,
} from './brand/brandPack.js';
export {
  contrastRatio,
  mixColors,
  normalizeColor,
  parseColor,
  relativeLuminance,
  toHex,
  type Rgba,
} from './color/color.js';
export {
  SCHEME_IDS,
  SURFACE_ROLES,
  deriveSchemes,
  schemeById,
  type Scheme,
  type SchemeId,
  type SurfaceRole,
} from './brand/schemes.js';
export { fitLogoBox } from './brand/logoFit.js';
export {
  brandFingerprint,
  isBindingRef,
  rebindPages,
  rebindPageState,
  resolveRef,
  withBinding,
  withoutBinding,
  type Binding,
  type BindingRef,
  type Bindings,
  type BrandColorRole,
  type BrandFontRole,
  type RebindContext,
} from './brand/bindings.js';
