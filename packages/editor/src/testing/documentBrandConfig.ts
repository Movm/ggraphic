// SPDX-License-Identifier: MPL-2.0
/**
 * A one-tab page config for the tests of the document brand: a colour ground, one text with a
 * marker run (no marker style of its own) and the Text tab. The actions are the editor's element
 * factories, given the config's `brand` exactly as a host does.
 */
import { type BrandPack } from '@ggraphic/core';

import { createElementActions } from '../configs/factory/actionFactories.js';
import { type BaseCanvasState } from '../configs/factory/baseTypes.js';
import { carryInstanceState } from '../configs/factory/carryInstanceState.js';
import { makeSectionDefiner } from '../configs/factory/defineSection.js';
import { type FullCanvasConfig } from '../configs/types.js';
import { CombinedTextSection } from '../sidebar/sections/CombinedTextSection.js';

export interface BrandTestState extends BaseCanvasState {
  backgroundColor: string;
}
export type BrandTestActions = ReturnType<typeof createElementActions<BrandTestState>>;

const section = makeSectionDefiner<BrandTestState, BrandTestActions>();

export function brandTestConfig(
  id: string,
  brand?: BrandPack
): FullCanvasConfig<BrandTestState, BrandTestActions> {
  const width = 1080;
  const height = 1080;
  return {
    id,
    canvas: { width, height },
    ...(brand ? { brand } : {}),
    tabs: [{ id: 'text', icon: () => null, label: 'Text', ariaLabel: 'Text' }],
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
    },
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
    createInitialState: (props) => ({
      isDesktop: true,
      ...carryInstanceState(props),
      backgroundColor: '#ffffff',
      additionalTexts: [
        {
          id: 'text-1',
          type: 'body',
          text: 'Ich will ++frei++ sein',
          x: 40,
          y: 40,
          width: 900,
          fontSize: 60,
          fontFamily: 'Arial, sans-serif',
          fill: '#000000',
        },
      ],
    }),
    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory) =>
      createElementActions<BrandTestState>(
        getState,
        setState,
        saveToHistory,
        debouncedSaveToHistory,
        width,
        height,
        '#000000',
        undefined,
        1,
        brand
      ),
  };
}
