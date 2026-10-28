// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The one page config every Studio template shares: a colour ground and the
 * editor's free elements, with the Text, Elements and Uploads tabs. Templates
 * differ only in what a fresh page starts with (`seeds.ts`). The config lays
 * out on the document's format, so one template serves every format.
 */
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { makeSectionDefiner } from '@ggraphic/editor/configs/factory/defineSection';
import { injectFeatureProps } from '@ggraphic/editor/configs/featureInjector';
import { type FullCanvasConfig } from '@ggraphic/editor/configs/types';
import { getCanvasFormatOrDefault } from '@ggraphic/editor/formats/index';
import {
  AssetsSection,
  CombinedTextSection,
  UploadsSection,
} from '@ggraphic/editor/sidebar/sections/index';
import { defineTemplate, registerTemplates } from '@ggraphic/editor/templates/registry';
import { PiSquaresFour, PiTextAa, PiUploadSimple } from 'react-icons/pi';

import { createStudioActions, type StudioActions } from './actions';
import { STUDIO_TEMPLATE_IDS, type StudioTemplateId } from './ids';
import { pageStateFrom, type StudioPageState } from './pageState';
import { seedFor } from './seeds';

const section = makeSectionDefiner<StudioPageState, StudioActions>();

// Read when the picker renders, so a project of another organisation offers its colours.
const backgroundColors = () =>
  activeBrand().palette.map(({ id, label, color }) => ({ id, label, color }));

export function createStudioConfig(
  templateId: StudioTemplateId,
  formatId: string | undefined
): FullCanvasConfig<StudioPageState, StudioActions> {
  const { width, height } = getCanvasFormatOrDefault(formatId);
  return {
    id: templateId,
    canvas: { width, height },
    features: { icons: true, shapes: true, illustrations: true },
    multiPage: { enabled: true, maxPages: 10, heterogeneous: true },
    backgroundType: 'color',
    fonts: { primary: activeBrand().fonts.headline, fontSize: 60, requireFontLoad: true },

    tabs: [
      { id: 'text', icon: PiTextAa, label: 'Text', ariaLabel: 'Text: add and edit text' },
      {
        id: 'elements',
        icon: PiSquaresFour,
        label: 'Elements',
        ariaLabel: 'Elements: shapes, icons, illustrations and emoji',
      },
      {
        id: 'uploads',
        icon: PiUploadSimple,
        label: 'Uploads',
        ariaLabel: 'Uploads: your own images',
      },
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
    createInitialState: (props) => pageStateFrom(props, seedFor(templateId, width, height)),
    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory) =>
      createStudioActions(getState, setState, saveToHistory, debouncedSaveToHistory, width, height),
  };
}

// Module-level, so registering again is the registry's no-op instead of a duplicate id.
const STUDIO_TEMPLATES = STUDIO_TEMPLATE_IDS.map((id) =>
  defineTemplate({ id, load: (formatId) => Promise.resolve(createStudioConfig(id, formatId)) })
);

/** Puts the Studio templates into the editor's registry; call before rendering. */
export function registerStudioTemplates(): void {
  registerTemplates(...STUDIO_TEMPLATES);
}
