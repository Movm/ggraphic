// SPDX-License-Identifier: AGPL-3.0-only
import { createPageActions } from '@ggraphic/editor/page/actions';
import { type PageState } from '@ggraphic/editor/page/pageState';
import { describe, expect, it } from 'vitest';

import { blockLibrary, liftLibraryBlock } from '../blocks/blockLibrary';

import { studioCatalog } from './catalog';

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
    } as unknown as PageState;
    const history: PageState[] = [];
    // The editor's actions read the committed state, not the one `setState` just wrote.
    const committed = state;
    const actions = createPageActions(
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
