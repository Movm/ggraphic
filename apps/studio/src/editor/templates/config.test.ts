// SPDX-License-Identifier: AGPL-3.0-only
import { registerBrandPacks, activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, describe, expect, it } from 'vitest';

import { studioBrand } from '../../brand';

import { createStudioActions } from './actions';
import { createStudioConfig } from './config';
import { HEADLINE_TEMPLATE_ID } from './ids';
import { type StudioPageState } from './pageState';

afterEach(() => registerBrandPacks([studioBrand]));

function setup() {
  let state = {
    backgroundColor: '#000000',
    additionalTexts: [],
    shapeInstances: [],
    userImageInstances: [],
    layerOrder: [],
  } as unknown as StudioPageState;
  const actions = createStudioActions(
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
