// SPDX-License-Identifier: AGPL-3.0-only
import type { SidebarTabBarProps as ChromeSidebarTabBarProps } from '@ggraphic/editor-chrome';

import type { AdditionalText } from '../configs/types.js';
import type { SidebarTabId } from './tabTypes.js';

export type {
  BackgroundColorOption,
  CoreSidebarTabId,
  SidebarTab,
  SidebarTabId,
} from './tabTypes.js';

export interface TextSectionProps {
  quote: string;
  name: string;
  onQuoteChange: (quote: string) => void;
  onNameChange: (name: string) => void;
  onAddHeader?: () => void;
  onAddText?: () => void;
  additionalTexts?: AdditionalText[];
  onUpdateAdditionalText?: (id: string, text: string) => void;
  onRemoveAdditionalText?: (id: string) => void;
  // Font Size Props
  quoteFontSize?: number;
  nameFontSize?: number;
  onQuoteFontSizeChange?: (size: number) => void;
  onNameFontSizeChange?: (size: number) => void;
  onUpdateAdditionalTextFontSize?: (id: string, size: number) => void;
}

export type { StockImageAttribution } from '../common/imageSourceTypes.js';

export interface ImageSectionProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  onReset: () => void;
}

export interface GradientSectionProps {
  opacity: number;
  onOpacityChange: (opacity: number) => void;
}

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type SidebarTabBarProps = ChromeSidebarTabBarProps<SidebarTabId>;

export type { SidebarPanelProps } from '@ggraphic/editor-chrome';
