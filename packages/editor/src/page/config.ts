// SPDX-License-Identifier: MPL-2.0
/**
 * The one page config for templates as data: a colour ground and the editor's free elements, with
 * the Text, Elements, Uploads and Tools tabs. Templates differ only in what a fresh page starts
 * with (`seedFor`). The config lays out on the document's format, so one template serves every
 * format.
 */
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { makeSectionDefiner } from '@ggraphic/editor/configs/factory/defineSection';
import { injectFeatureProps } from '@ggraphic/editor/configs/featureInjector';
import { type FullCanvasConfig } from '@ggraphic/editor/configs/types';
import { getCanvasFormatOrDefault } from '@ggraphic/editor/formats/index';
import { messages } from '@ggraphic/editor/i18n/messages';
import {
  AssetsSection,
  CombinedTextSection,
  ToolsSection,
  UploadsSection,
} from '@ggraphic/editor/sidebar/sections/index';
import { PiSquaresFour, PiTextAa, PiToolbox, PiUploadSimple } from 'react-icons/pi';

import { createPageActions, type PageActions } from './actions.js';
import { pageStateFrom, type PageSeed, type PageState } from './pageState.js';
import { noTemplates, type TemplateLookup } from './slotBudgets.js';

const section = makeSectionDefiner<PageState, PageActions>();

// Read when the picker renders, so a project of another organisation offers its colours.
const backgroundColors = () =>
  activeBrand().palette.map(({ id, label, color, ref }) => ({
    id,
    label,
    color,
    ...(ref && { ref }),
  }));

export interface PageConfigOptions {
  /** The config id the pages document stores. */
  id: string;
  /** The canvas format; the default format when unknown. */
  formatId: string | undefined;
  /** What a page that has never been saved starts with, on a `width` × `height` sheet. */
  seedFor: (width: number, height: number) => PageSeed;
  /** The host's catalogue, for the line limits of template slots. */
  templateOf?: TemplateLookup;
}

export function createPageConfig({
  id,
  formatId,
  seedFor,
  templateOf = noTemplates,
}: PageConfigOptions): FullCanvasConfig<PageState, PageActions> {
  const { width, height } = getCanvasFormatOrDefault(formatId);
  const t = messages().pageTabs;
  return {
    id,
    canvas: { width, height },
    features: { icons: true, shapes: true, illustrations: true },
    multiPage: { enabled: true, maxPages: 10, heterogeneous: true },
    backgroundType: 'color',
    fonts: { primary: activeBrand().fonts.headline, fontSize: 60, requireFontLoad: true },

    tabs: [
      { id: 'text', icon: PiTextAa, label: t.text, ariaLabel: t.textAriaLabel },
      { id: 'elements', icon: PiSquaresFour, label: t.elements, ariaLabel: t.elementsAriaLabel },
      { id: 'uploads', icon: PiUploadSimple, label: t.uploads, ariaLabel: t.uploadsAriaLabel },
      { id: 'tools', icon: PiToolbox, label: t.tools, ariaLabel: t.toolsAriaLabel },
    ],

    sections: {
      text: section({
        component: CombinedTextSection,
        propsFactory: (state, actions) => ({
          additionalTexts: state.additionalTexts,
          onAddHeader: actions.addHeader,
          onAddSubheader: actions.addSubheader,
          onAddText: actions.addText,
          onUpdateText: actions.updateAdditionalText,
          onRemoveText: actions.removeAdditionalText,
        }),
      }),
      elements: section({
        component: AssetsSection,
        propsFactory: (state, actions, context) => ({
          onAddAsset: actions.addAsset,
          ...injectFeatureProps(state, actions, context),
        }),
      }),
      uploads: section({
        component: UploadsSection,
        propsFactory: (_state, actions) => ({ onPlaceFromUrl: actions.addUserImageFromUrl }),
      }),
      tools: section({
        component: ToolsSection,
        propsFactory: (_state, actions) => ({ onPlaceImageUrl: actions.addUserImageFromUrl }),
      }),
    },

    background: (state, actions) => ({
      colors: backgroundColors(),
      currentColor: state.backgroundColor,
      onColorChange: actions.setBackgroundColor,
    }),

    elements: [
      {
        id: 'background',
        type: 'background',
        x: 0,
        y: 0,
        order: -1,
        width,
        height,
        fillStateKey: 'backgroundColor',
      },
    ],

    calculateLayout: () => ({}),
    createInitialState: (props) => pageStateFrom(props, seedFor(width, height)),
    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory) =>
      createPageActions(
        getState,
        setState,
        saveToHistory,
        debouncedSaveToHistory,
        width,
        height,
        templateOf
      ),
  };
}
