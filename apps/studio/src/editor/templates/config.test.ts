// SPDX-License-Identifier: AGPL-3.0-only
import { registerBrandPacks, activeBrand } from '@ggraphic/editor/brand';
import { registerMessages } from '@ggraphic/editor/i18n';
import { createPageActions, type PageState } from '@ggraphic/editor/page';
import { afterEach, describe, expect, it } from 'vitest';

import { studioBrand } from '../../brand';

import { createStudioConfig } from './config';
import { HEADLINE_TEMPLATE_ID } from './ids';

afterEach(() => registerBrandPacks([studioBrand]));

function setup() {
  let state = {
    backgroundColor: '#000000',
    additionalTexts: [],
    shapeInstances: [],
    userImageInstances: [],
    layerOrder: [],
  } as unknown as PageState;
  const actions = createPageActions(
    () => state,
    (change) => {
      state = typeof change === 'function' ? change(state) : { ...state, ...change };
    },
    () => undefined,
    () => undefined,
    1080,
    1350
  );
  const { colors, onColorChange } = createStudioConfig(HEADLINE_TEMPLATE_ID, undefined).background!(
    state,
    actions
  );
  return { colors: colors!, onColorChange: onColorChange!, state: () => state };
}

describe('background swatches', () => {
  it('carry the ref of the brand swatch, and a pick through them binds the background', () => {
    const swatch = { id: 'main', label: 'Main', color: '#336699', ref: 'brand.primary' } as const;
    registerBrandPacks([{ ...activeBrand(), palette: [swatch] }]);
    const { colors, onColorChange, state } = setup();
    const picked = colors.find((c) => c.id === 'main')!;
    expect(picked.ref).toBe('brand.primary');
    onColorChange(picked.color, picked.ref);
    expect(state().bind?.['backgroundColor']).toEqual({ ref: 'brand.primary', value: '#336699' });
  });

  it("picking the Studio brand's primary swatch leaves the background bound", () => {
    registerBrandPacks([studioBrand]);
    const { colors, onColorChange, state } = setup();
    const picked = colors.find((c) => c.color === studioBrand.colors.primary)!;
    onColorChange(picked.color, picked.ref);
    expect(state().bind?.['backgroundColor']?.ref).toBe('brand.primary');
  });
});

describe('the Studio page config', () => {
  it('offers the tools tab, with its section', () => {
    // The Studio speaks English (`registerEditor`); the labels come from the editor's catalogue.
    registerMessages('en');
    const config = createStudioConfig(HEADLINE_TEMPLATE_ID, 'post-portrait');
    expect(config.tabs.map((tab) => tab.id)).toEqual(['text', 'elements', 'uploads', 'tools']);
    expect(config.tabs.find((tab) => tab.id === 'tools')?.label).toBe('Tools');
    expect(config.sections['tools']).toBeDefined();
  });
});
