// SPDX-License-Identifier: MPL-2.0
/** Canvas configs for hosts with their own page logic: `FullCanvasConfig` and its element configs, the loader, the factories, feature injection, placeholders and the share section. */
export {
  type AdditionalText,
  type AnyCanvasConfig,
  type BackgroundElementConfig,
  type CanvasElementConfig,
  type FullCanvasConfig,
  type HeterogeneousPage,
  type ImageElementConfig,
  type LayoutResult,
  type RectElementConfig,
  type ShareDescription,
  type TextElementConfig,
} from '../configs/types.js';
export { loadCanvasConfig, preloadCanvasTemplate } from '../configs/configLoader.js';
export {
  createAssetActions,
  createChartActions,
  createCircleBadgeActions,
  createElementActions,
  createFrameActions,
  createIconActions,
  createIllustrationActions,
  createPillBadgeActions,
  createShapeActions,
  createUserImageActions,
} from '../configs/factory/actionFactories.js';
export {
  type BaseCanvasActions,
  type BaseCanvasState,
  type CanvasDimensions,
  type CanvasFeatures,
  type ColorBackgroundState,
  type IconState,
  type ImageBackgroundState,
} from '../configs/factory/baseTypes.js';
export {
  carriedInstanceKeys,
  type CarriedInstanceState,
  carryBackgroundAdjustments,
  carryBackgroundRotation,
  carryInstanceState,
  carryTemplateRotations,
  carryTemplateTextAligns,
} from '../configs/factory/carryInstanceState.js';
export { createPrimaryText, createSecondaryText } from '../configs/factory/createTextElement.js';
export { makeSectionDefiner } from '../configs/factory/defineSection.js';
export { fromLayout } from '../configs/factory/layoutAccessors.js';
export { injectFeatureProps } from '../configs/featureInjector.js';
export { getPlaceholder, PLACEHOLDER_TEXT } from '../configs/placeholders.js';
export { createShareSection } from '../configs/shareSection.js';
