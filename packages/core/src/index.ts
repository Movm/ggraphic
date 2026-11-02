// SPDX-License-Identifier: AGPL-3.0-only
export { type BackgroundColorOption } from './brand/backgroundColorOption.js';
export { FONT_FAMILY_ALIASES, aliasFontFamily } from './brand/fontAliases.js';
export { brandDefault } from './brand/brandDefault.js';
export {
  type BrandBackground,
  type BrandColors,
  type BrandEffects,
  type BrandFontFace,
  type FontCuts,
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
export { SHADE_STOPS, shadeAlphaAt, type ShadeDirection } from './color/shade.js';
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
export { defineBrand, type BrandInputs } from './brand/define.js';
export { fitLogoBox } from './brand/logoFit.js';
export {
  FONT_ROLES,
  currentFontRole,
  fontRoleOptions,
  type FontRole,
  type FontRoleOption,
} from './brand/fontRoles.js';
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
  type GateCover,
  type GateBudget,
  type GateContext,
  type GateProblem,
  type GateRule,
} from './templates/gate.js';
export { hugOf, hugPlates, type HugAdapter, type PlateHug } from './templates/hug.js';
export {
  instantiateTemplatePage,
  offeredSchemes,
  roomBelow,
  type ElementBox,
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
export * from './model/index.js';
