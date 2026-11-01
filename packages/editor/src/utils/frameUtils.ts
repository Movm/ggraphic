// SPDX-License-Identifier: MPL-2.0
/** Frame presets, paths and instances (`./framePresets`), plus the sidebar icon of each clip type. */
import { type FrameClipType } from '@ggraphic/core';
import {
  PiChatCircleFill,
  PiCircleDashedBold,
  PiCircleFill,
  PiCloudFill,
  PiDiamondFill,
  PiDropFill,
  PiEggFill,
  PiFrameCornersFill,
  PiHeartFill,
  PiHexagonFill,
  PiLeafFill,
  PiOctagonFill,
  PiSquareFill,
  PiStarFill,
  PiTagFill,
  PiTriangleFill,
} from 'react-icons/pi';

import type { IconType } from 'react-icons';

export {
  createFrameInstance,
  DEFAULT_FRAME_SIZE,
  FRAME_CATEGORY_ORDER,
  FRAME_PRESET_PATHS,
  FRAME_PRESETS,
  type FrameCategory,
  type FrameClipType,
  type FrameInstance,
  type FramePreset,
  getFramePreset,
} from './framePresets.js';

export const FRAME_ICON_MAP: Record<FrameClipType, IconType> = {
  circle: PiCircleFill,
  'rounded-rect': PiFrameCornersFill,
  square: PiSquareFill,
  oval: PiEggFill,
  hexagon: PiHexagonFill,
  diamond: PiDiamondFill,
  drop: PiDropFill,
  leaf: PiLeafFill,
  star: PiStarFill,
  heart: PiHeartFill,
  cloud: PiCloudFill,
  blob: PiCircleFill,
  arch: PiFrameCornersFill,
  octagon: PiOctagonFill,
  pentagon: PiHexagonFill,
  triangle: PiTriangleFill,
  'speech-bubble': PiChatCircleFill,
  'banner-tag': PiTagFill,
  ring: PiCircleDashedBold,
  ribbon: PiTagFill,
};
