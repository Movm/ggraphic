// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest';

import { createElementActions } from './actionFactories.js';

import type { BaseCanvasState } from './baseTypes.js';

/**
 * #214: deleting an element must take its id out of the page's `layerOrder`; the page engine
 * (`page/actions.ts`) does, and the factory actions did not, so the id stayed in the stored order
 * until a reorder rewrote the list.
 */
const REMOVERS = [
  ['removeAsset', 'assetInstances'],
  ['removeShape', 'shapeInstances'],
  ['removeIllustration', 'illustrationInstances'],
  ['removeAdditionalText', 'additionalTexts'],
  ['removePillBadge', 'pillBadgeInstances'],
  ['removeCircleBadge', 'circleBadgeInstances'],
  ['removeChart', 'chartInstances'],
  ['removeFrame', 'frameInstances'],
  ['removeUserImage', 'userImageInstances'],
] as const;

function actionsOver(initial: Record<string, unknown>) {
  let state = initial;
  const setState = (partial: unknown) => {
    state =
      typeof partial === 'function'
        ? (partial as (prev: typeof state) => typeof state)(state)
        : { ...state, ...(partial as object) };
  };
  const actions = createElementActions(
    () => state as unknown as BaseCanvasState,
    setState as never,
    vi.fn(),
    vi.fn(),
    1080,
    1080
  ) as unknown as Record<string, (id: string) => void>;
  return { actions, state: () => state };
}

const collections = (): Record<string, unknown> =>
  Object.fromEntries(
    REMOVERS.map(([, key]) => [
      key,
      [
        { id: `${key}-1`, src: '' },
        { id: `${key}-2`, src: '' },
      ],
    ])
  );

describe('removing an element', () => {
  it.each(REMOVERS)('%s drops the id from layerOrder and keeps the others', (remove, key) => {
    const h = actionsOver({
      ...collections(),
      layerOrder: [`${key}-1`, 'ornament', `${key}-2`],
    });
    h.actions[remove]!(`${key}-1`);
    expect((h.state()[key] as { id: string }[]).map((item) => item.id)).toEqual([`${key}-2`]);
    expect(h.state().layerOrder).toEqual(['ornament', `${key}-2`]);
  });

  it.each(REMOVERS)(
    '%s writes no layerOrder where the page has none, or does not list it',
    (remove, key) => {
      const without = actionsOver(collections());
      without.actions[remove]!(`${key}-1`);
      expect('layerOrder' in without.state()).toBe(false);

      const unlisted = actionsOver({ ...collections(), layerOrder: ['ornament'] });
      const before = unlisted.state().layerOrder;
      unlisted.actions[remove]!(`${key}-1`);
      expect(unlisted.state().layerOrder).toBe(before);
    }
  );
});
