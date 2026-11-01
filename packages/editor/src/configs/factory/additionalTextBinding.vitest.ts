// SPDX-License-Identifier: MPL-2.0
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { brandDefault, type BrandPack } from '@ggraphic/core';
import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';

import { createAdditionalTextActions } from './actionFactories.js';

import type { AdditionalText } from '../types.js';

const original = activeBrand();
const lora: BrandPack = {
  ...brandDefault,
  id: 'lora',
  fonts: { ...brandDefault.fonts, headline: 'Lora', body: 'Raleway' },
};
beforeEach(() => registerBrandPacks([lora]));
afterEach(() => registerBrandPacks([original]));

function setup() {
  let state: { additionalTexts: AdditionalText[] } = { additionalTexts: [] };
  const actions = createAdditionalTextActions(
    () => state,
    (change) => {
      state = typeof change === 'function' ? change(state) : { ...state, ...change };
    },
    () => {},
    () => {},
    1080,
    1350
  );
  return { actions, added: () => state.additionalTexts[0]! };
}

describe('a text added by the editor is born bound to its font role', () => {
  it.each([
    ['addHeader', 'font.headline', 'Lora'],
    ['addSubheader', 'font.headline', 'Lora'],
    ['addText', 'font.body', 'Raleway'],
    ['addBodyTextWithContent', 'font.body', 'Raleway'],
  ] as const)('%s binds its family to %s', (action, ref, family) => {
    const { actions, added } = setup();
    (actions[action] as (content?: string) => void)('Hello');
    expect(added().fontFamily.startsWith(`${family},`)).toBe(true);
    expect(added().bind).toEqual({ fontFamily: { ref, value: family } });
  });
});
