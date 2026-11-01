// SPDX-License-Identifier: MPL-2.0
/**
 * The data shapes of the canvas elements, as they stand in a page's state. Types and two
 * constants only: no editor, no React, no Konva, so a server can build, read and change pages.
 * The shapes are stored: add fields, never rename them.
 */
export { ASSET_TARGET_SIZE, type AssetInstance } from './asset.js';
export {
  type CircleBadgeInstance,
  type CircleBadgeTextLine,
  type PillBadgeFontStyle,
  type PillBadgeInstance,
} from './badges.js';
export {
  type ChartDataPoint,
  type ChartInstance,
  type ChartLegendPosition,
  type ChartSeries,
  type ChartType,
} from './chart.js';
export { type CornerRadius, type Corners } from './cornerRadius.js';
export { type GradientFill, type GradientStop } from './fill.js';
export { type FrameCategory, type FrameClipType, type FrameInstance } from './frame.js';
export { type IconSource, type IconState } from './icon.js';
export {
  type IllustrationInstance,
  type KawaiiIllustrationType,
  type KawaiiInstance,
  type KawaiiMood,
  type SvgInstance,
  type SvgSource,
  type SvgSources,
} from './illustration.js';
export { type ShapeBlendMode, type ShapeInstance, type ShapeType, type TailSide } from './shape.js';
export {
  type AdditionalText,
  type FontWeight,
  TEXT_ALIGNS,
  type TextAccent,
  type TextAlign,
  type TextMarker,
} from './text.js';
export { type ElementPlacement, type UserImageInstance } from './userImage.js';
