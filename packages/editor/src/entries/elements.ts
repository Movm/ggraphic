// SPDX-License-Identifier: MPL-2.0
/** The element model the editor adds to core: instance factories and types for shapes, charts, badges, frames, user images, icons, illustrations and assets; duplicating; lifted blocks. */
export {
  BLOCK_COLLECTIONS,
  blockElementIds,
  type BlockSlide,
  boundsOf,
  type LiftedBlock,
  placeBlock,
  translateBlock,
} from '../blocks/liftedBlock.js';
export { type StockImage, type StockImageAttribution } from '../common/imageSourceTypes.js';
export {
  ASSET_TARGET_SIZE,
  type AssetAudience,
  type AssetInstance,
  assetMatchesLocale,
  type CanvasAssetCatalog,
  createAssetInstance,
  emojiCodeAssetId,
  getAssetById,
  type IllustrationSources,
  registerAssetCatalog,
  resolveAssetInstanceSrc,
  type UniversalAsset,
} from '../utils/canvasAssets.js';
export {
  DEFAULT_ICON_SET,
  generateIconDataUrl,
  type IconDef,
  loadAllIcons,
  loadIconSetCatalog,
  loadIconSetsFor,
} from '../utils/canvasIcons.js';
export { type ChartInstance, type ChartType, createChartInstance } from '../utils/chartUtils.js';
export {
  type CircleBadgeInstance,
  createCircleBadgeInstance,
  type CircleBadgeTextLine,
} from '../utils/circleBadgeUtils.js';
export { zoomBackground } from '../utils/coverFit.js';
export { createInstanceId, duplicateElementInState } from '../utils/duplicateElement.js';
export {
  type EmojiCatalogEntry,
  type EmojiCatalogGroup,
  loadEmojiCatalog,
} from '../utils/emoji/emojiCatalog.js';
export { type ExternalIconPayload } from '../utils/externalIcons.js';
export { type FrameClipType, type FrameInstance } from '../utils/frameUtils.js';
export { type GradientFill } from '../utils/gradientFill.js';
export {
  catalogIconId,
  iconInstanceIdsFor,
  placedIconId,
  recolorIconInstances,
} from '../utils/iconInstances.js';
export { createIllustration } from '../utils/illustrations/registry.js';
export {
  type IllustrationDef,
  type IllustrationInstance,
  type SvgDef,
} from '../utils/illustrations/types.js';
export { backgroundAdjustments } from '../utils/userImageUtils.js';
export { createPillBadgeInstance, type PillBadgeInstance } from '../utils/pillBadgeUtils.js';
export {
  COMPOSER_PLANE_IDS,
  createShape,
  photoStripBeside,
  type ShapeInstance,
  type ShapeType,
} from '../utils/shapes.js';
export {
  BACKGROUND_STRAIGHTEN_KEY,
  backgroundStraighten,
  straightenResetFor,
} from '../utils/straighten.js';
export {
  createUserImageInstanceFromUrl,
  type ElementPlacement,
  type ImageAdjustments,
  type UserImageInstance,
  type UserImagePlacement,
} from '../utils/userImageUtils.js';
