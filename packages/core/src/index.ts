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
  type BrandLogoAlt,
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
export { duotoneRamp } from './color/duotone.js';
export {
  SCHEME_IDS,
  SURFACE_ROLES,
  deriveSchemes,
  schemeById,
  resolveScheme,
  type Scheme,
  type SchemeId,
  type SurfaceRole,
} from './brand/schemes.js';
export {
  DEFAULT_BRAND_LAYOUT,
  LOGO_CORNERS,
  type BrandLayout,
  type LogoCorner,
  BRAND_LAYOUT_BOUNDS,
  brandLayout,
  clampBrandLayout,
  logoEnvelope,
  safeArea,
} from './brand/layout.js';
export { deriveBrandColors, deriveGrounds, type BrandColorInputs } from './brand/derive.js';
export { fitLogoBox } from './brand/logoFit.js';
export {
  brandFingerprint,
  firstFontFamily,
  groundClass,
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
export {
  GATE_RULES,
  checkTemplate,
  type GateAdapter,
  type GateBudget,
  type GateContext,
  type GateProblem,
  type GateRule,
} from './templates/gate.js';
export {
  instantiateTemplatePage,
  offeredSchemes,
  type GeometryAxis,
  type GeometryTable,
  type InstantiateContext,
  type InstantiateResult,
  type TemplateFrameKind,
  type TemplateInput,
} from './templates/instantiate.js';
export {
  MIN_TEXT_SHARE,
  checkSlotBudget,
  countChars,
  countWords,
  minTextSizePx,
  type BudgetViolation,
  type SlotBudget,
} from './templates/slotBudget.js';
