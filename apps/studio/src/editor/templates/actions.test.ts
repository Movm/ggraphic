// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { blockLibrary, liftLibraryBlock } from '../blocks/blockLibrary';

import { createStudioActions } from './actions';
import { studioCatalog } from './catalog';
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

describe('insertBlock', () => {
  it('is one history entry', () => {
    let state = {
      backgroundColor: '#ffffff',
      additionalTexts: [],
      shapeInstances: [],
      userImageInstances: [],
      selectedIcons: [],
      iconStates: {},
      layerOrder: [],
    } as unknown as StudioPageState;
    const history: StudioPageState[] = [];
    // The editor's actions read the committed state, not the one `setState` just wrote.
    const committed = state;
    const actions = createStudioActions(
      () => committed,
      (change) => {
        state = typeof change === 'function' ? change(state) : { ...state, ...change };
      },
      (saved) => history.push(saved!),
      () => undefined,
      1080,
      1350
    );
    const library = blockLibrary(studioCatalog().entries);
    const block = liftLibraryBlock(library[1]!, { formatId: 'post-portrait' }, 'tok123')!;
    actions.insertBlock(block);
    expect(history).toHaveLength(1);
    expect(history[0]!.additionalTexts).toHaveLength(3);
    expect(history[0]!.groups).toHaveLength(1);
    // State and history hold the same group, not two ids for one insert.
    expect(history[0]!.groups).toEqual(state.groups);
    expect(state.layerOrder).toEqual(block.layerOrder);
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
