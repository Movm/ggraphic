// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { createPageActions } from './actions.js';
import { type PageState } from './pageState.js';

function setup(initial: Partial<PageState>) {
  let state = {
    backgroundColor: '#000000',
    additionalTexts: [],
    shapeInstances: [],
    userImageInstances: [],
    layerOrder: [],
    ...initial,
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

describe('updateShape on a hugging plate', () => {
  const plate = {
    id: 'plate',
    type: 'rect',
    x: 10,
    y: 10,
    width: 100,
    height: 40,
    rotation: 0,
    hug: { text: 't', padX: 8, padY: 4 },
  };

  it('lets go of the text once the plate is moved or resized by hand', () => {
    for (const partial of [{ width: 300 }, { height: 90 }, { x: 50 }, { y: 70 }]) {
      const { actions, state } = setup({ shapeInstances: [plate] as never });
      actions.updateShape('plate', partial);
      expect(state().shapeInstances[0]).not.toHaveProperty('hug');
    }
  });

  it('keeps hugging when only its colour changes', () => {
    const { actions, state } = setup({ shapeInstances: [plate] as never });
    actions.updateShape('plate', { color: '#ff0000' } as never);
    expect(state().shapeInstances[0]).toHaveProperty('hug');
  });
});

describe('toggleIcon', () => {
  it('keeps the svg and source of an icon from the icon search on the page', () => {
    // Without them the renderer has nothing to draw and the credit line has no source.
    const { actions, state } = setup({ selectedIcons: [], iconStates: {} } as never);
    const source = {
      kind: 'iconify',
      prefix: 'reicon',
      name: 'bicycle-filled',
      setTitle: 'Reicon',
      licence: 'MIT',
      author: 'REICON',
    } as const;
    const svg = '<svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>';
    actions.toggleIcon('iconify:reicon:bicycle-filled', true, undefined, { svg, source });
    expect(state().iconStates['iconify:reicon:bicycle-filled']).toMatchObject({ svg, source });
  });
});

describe('toggleIcon for an icon already on the page', () => {
  it('places a copy under its own instance id that shows the same icon', () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>';
    const source = {
      kind: 'iconify',
      prefix: 'reicon',
      name: 'bicycle-filled',
      setTitle: 'Reicon',
      licence: 'MIT',
      author: 'REICON',
    } as const;
    const { actions, state } = setup({ selectedIcons: [], iconStates: {} } as never);
    actions.toggleIcon('iconify:reicon:bicycle-filled', true, undefined, { svg, source });
    actions.toggleIcon('iconify:reicon:bicycle-filled', true, undefined, { svg, source });
    const ids = state().selectedIcons;
    expect(new Set(ids).size).toBe(2);
    expect(new Set(state().layerOrder).size).toBe(state().layerOrder!.length);
    expect(state().iconStates[ids[1]!]).toMatchObject({
      iconId: 'iconify:reicon:bicycle-filled',
      svg,
    });
  });
});
