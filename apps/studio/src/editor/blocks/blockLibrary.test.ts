// SPDX-License-Identifier: AGPL-3.0-only
import { deriveSchemes } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { blockElementIds, type LiftedBlock } from '@ggraphic/editor/blocks/liftedBlock';
import { describe, expect, it } from 'vitest';

import { createStudioActions } from '../templates/actions';
import { studioCatalog } from '../templates/catalog';
import { type StudioPageState } from '../templates/pageState';

import { blockLibrary, blockScheme, liftLibraryBlock } from './blockLibrary';

const library = () => blockLibrary(studioCatalog().entries);
const find = (id: string) => library().find((b) => b.id === id)!;
const QUOTE = 'studio-quote/quote-with-name';
const FORMAT = 'post-portrait';
const lightGround = () => deriveSchemes(activeBrand()).find((s) => s.id === 'light')!.roles.ground;

describe('blockLibrary', () => {
  it('lists the template blocks with library ids', () => {
    expect(library().map((b) => b.id)).toEqual([
      'studio-headline/headline-with-bar',
      'studio-quote/quote-with-name',
      'studio-number/number-with-explanation',
      'studio-event-giant-date/date-with-place',
      'studio-event-photo-date/date-with-place',
      'studio-event-programme/date-with-place',
      'studio-photo-quote/quote-with-person',
      'studio-photo-number/number-with-line',
      'studio-demand-photo-band/demand-band',
      'studio-figure-of-the-month/number-with-explanation',
      'studio-invitation-panel/date-with-place',
      'studio-number-one-digit/number-with-explanation',
      'studio-number-percent/number-with-explanation',
      'studio-number-photo-strip/number-with-explanation',
      'studio-number-two-columns/column-a',
      'studio-number-two-columns/column-b',
      'studio-number-word-stack/number-with-explanation',
      'studio-petition-face/progress',
      'studio-quote-card/quote-with-name',
      'studio-statement-panel-dots/statement-with-text',
      'studio-study-kicker-boxes/kicker-headline',
    ]);
    expect(find(QUOTE)).toMatchObject({
      version: 1,
      title: 'Quote with name',
      family: 'quote',
      templateId: 'studio-quote',
      elementIds: ['quote-mark', 'headline', 'subline'],
    });
  });
});

describe('liftLibraryBlock', () => {
  it('a lifted block has fresh ids and keeps its bindings', () => {
    const lifted = liftLibraryBlock(find(QUOTE), { formatId: FORMAT }, 'abc123')!;
    expect(lifted.additionalTexts.map((t) => t.id).sort()).toEqual([
      'headline-abc123',
      'quote-mark-abc123',
      'subline-abc123',
    ]);
    expect(lifted.layerOrder.every((id) => id.endsWith('-abc123'))).toBe(true);
    expect(blockElementIds(lifted)).toHaveLength(3);
    const headline = lifted.additionalTexts.find((t) => t.id === 'headline-abc123')!;
    expect(headline.bind?.['fill']?.ref).toBe('ink');
    expect(lifted.blockRef).toEqual({ id: QUOTE, version: 1 });
    expect(lifted.bounds.width).toBeGreaterThan(0);
    // Page-level keys never travel with a block.
    expect(lifted).not.toHaveProperty('backgroundColor');
    expect(lifted).not.toHaveProperty('templateRef');
  });

  it('a block on a page without a world takes the world of the page background', () => {
    const lifted = liftLibraryBlock(
      find(QUOTE),
      { formatId: FORMAT, backgroundColor: lightGround() },
      't1'
    );
    expect(lifted?.brandScheme).toBe('light');
    const onPrimary = liftLibraryBlock(
      find(QUOTE),
      { formatId: FORMAT, backgroundColor: activeBrand().colors.primary },
      't2'
    );
    expect(onPrimary?.brandScheme).toBe('primary');
  });

  it("a block on a page without a world or a matching ground takes the template's first world, and the page records it", () => {
    const entry = studioCatalog().entries.find((e) => e.id === 'studio-quote')!;
    expect(blockScheme(entry, { backgroundColor: '#123456' }, activeBrand())).toBe('light');
    const lifted = liftLibraryBlock(
      find(QUOTE),
      { formatId: FORMAT, backgroundColor: '#123456' },
      't1'
    )!;
    expect(lifted.brandScheme).toBe('light');
    const { actions, state } = pageWith({ backgroundColor: '#123456' });
    actions.insertBlock(lifted);
    expect(state().brandScheme).toBe('light');
  });

  it("the page's own world wins when the template offers it", () => {
    const entry = studioCatalog().entries.find((e) => e.id === 'studio-quote')!;
    expect(
      blockScheme(entry, { brandScheme: 'primary', backgroundColor: lightGround() }, activeBrand())
    ).toBe('primary');
    expect(blockScheme(entry, { brandScheme: 'photo' }, activeBrand())).toBe('light');
  });

  it('returns null on a format no template covers', () => {
    expect(liftLibraryBlock(find(QUOTE), { formatId: 'story' }, 't')).toBeNull();
  });
});

/**
 * A page as the editor holds it: an action reads the state committed by the last render, so a
 * change is applied to that state once, and `insert` settles it afterwards.
 */
function pageWith(initial: Partial<StudioPageState>) {
  let committed = {
    backgroundColor: lightGround(),
    additionalTexts: [],
    shapeInstances: [],
    userImageInstances: [],
    selectedIcons: [],
    iconStates: {},
    layerOrder: [],
    ...initial,
  } as unknown as StudioPageState;
  let live = committed;
  const actions = createStudioActions(
    () => committed,
    (change) => {
      live = typeof change === 'function' ? change(live) : { ...live, ...change };
    },
    () => undefined,
    () => undefined,
    1080,
    1350
  );
  return {
    actions: {
      insertBlock: (block: LiftedBlock) => {
        actions.insertBlock(block);
        committed = live;
      },
    },
    state: () => live,
  };
}

describe('the same block twice', () => {
  it('gives disjoint ids and two groups', () => {
    const { actions, state } = pageWith({});
    for (const token of ['aaaaaa', 'bbbbbb']) {
      actions.insertBlock(liftLibraryBlock(find(QUOTE), { formatId: FORMAT }, token)!);
    }
    const ids = state().additionalTexts.map((t) => t.id);
    expect(new Set(ids).size).toBe(6);
    expect(state().layerOrder).toHaveLength(6);
    const groups = state().groups!;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.id).not.toBe(groups[1]!.id);
    expect(groups[0]!.blockRef).toEqual({ id: QUOTE, version: 1 });
    expect(groups[0]!.elementIds.filter((id) => groups[1]!.elementIds.includes(id))).toEqual([]);
  });
});
