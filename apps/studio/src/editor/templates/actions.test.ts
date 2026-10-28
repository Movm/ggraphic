// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { createStudioActions } from './actions';
import { type StudioPageState } from './pageState';

function setup(initial: Partial<StudioPageState>) {
  let state = {
    backgroundColor: '#000000',
    additionalTexts: [],
    shapeInstances: [],
    userImageInstances: [],
    layerOrder: [],
    ...initial,
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
  return { actions, state: () => state };
}

describe('setBackgroundColor', () => {
  it('binds the background to the ref it was picked with', () => {
    const { actions, state } = setup({});
    actions.setBackgroundColor('#336699', 'brand.primary');
    expect(state().backgroundColor).toBe('#336699');
    expect(state().bind).toEqual({ backgroundColor: { ref: 'brand.primary', value: '#336699' } });
  });

  it('drops the binding for a colour picked without one, and the empty bind key', () => {
    const { actions, state } = setup({
      bind: { backgroundColor: { ref: 'brand.primary', value: '#336699' } },
    });
    actions.setBackgroundColor('#ABCDEF');
    expect(state().backgroundColor).toBe('#ABCDEF');
    expect(state()).not.toHaveProperty('bind');
  });

  it('keeps other bindings when it drops its own', () => {
    const other = { ref: 'brand.accent' as const, value: '#ffffff' };
    const { actions, state } = setup({
      bind: { backgroundColor: { ref: 'brand.primary', value: '#336699' }, other },
    });
    actions.setBackgroundColor('#ABCDEF');
    expect(state().bind).toEqual({ other });
  });
});
