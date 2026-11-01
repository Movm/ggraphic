// SPDX-License-Identifier: AGPL-3.0-only
import { createPageActions, pageStateFrom, type PageState } from '@ggraphic/editor/page';
import { registerAssetCatalog } from '@ggraphic/editor/elements';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { registerEditor } from '../../registerEditor';
import { studioAssetCatalog } from '../assetCatalog';

beforeAll(() => {
  registerEditor();
  registerAssetCatalog(studioAssetCatalog());
});

function harness() {
  let state: PageState = pageStateFrom({}, {});
  const saved: PageState[] = [];
  const actions = createPageActions(
    () => state,
    (change) => {
      state = typeof change === 'function' ? change(state) : { ...state, ...change };
    },
    (next) => saved.push(next ?? state),
    (next) => saved.push(next ?? state),
    1080,
    1350
  );
  return { actions, get: () => state, saved };
}

describe('placing bundled graphics', () => {
  it('places an emoji as an asset in the centre and layers it', () => {
    const { actions, get, saved } = harness();
    actions.addAsset('emoji-1f600');
    expect(get().assetInstances).toHaveLength(1);
    const placed = get().assetInstances[0]!;
    expect(placed).toMatchObject({ assetId: 'emoji-1f600', x: 540, y: 675 });
    expect(get().layerOrder).toContain(placed.id);
    expect(saved).toHaveLength(1);
  });

  it('updates and removes an asset', () => {
    const { actions, get } = harness();
    actions.addAsset('emoji-1f600');
    const id = get().assetInstances[0]!.id;
    actions.updateAsset(id, { scale: 2 });
    expect(get().assetInstances[0]!.scale).toBe(2);
    actions.removeAsset(id);
    expect(get().assetInstances).toEqual([]);
    expect(get().layerOrder).not.toContain(id);
  });

  it('places an illustration at the click position and removes it with its layer', async () => {
    const { actions, get } = harness();
    actions.addIllustration('op-bust-mask-1', { center: { x: 100, y: 200 } });
    await vi.waitFor(() => expect(get().illustrationInstances).toHaveLength(1));
    const placed = get().illustrationInstances[0]!;
    expect(placed).toMatchObject({ illustrationId: 'op-bust-mask-1', x: 100, y: 200 });
    expect(get().layerOrder).toContain(placed.id);
    actions.removeIllustration(placed.id);
    expect(get().illustrationInstances).toEqual([]);
    expect(get().layerOrder).not.toContain(placed.id);
  });
});
