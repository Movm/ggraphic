// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Adding a page carries the active page's background and its brand over. A
 * host's "blank page" needs the brand without the background: before, the
 * only choice was all or nothing, so the Grünerator's „Leere Seite" came with
 * the current page's photo (#166), and `false` would have cut the page loose
 * from its brand.
 *
 * Checked at the seam: what `addPage` hands the template's
 * `createInitialState`. Which keys a template then keeps is its own business.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as Y from 'yjs';

import { loadCanvasConfig } from '../../configs/configLoader.js';
import { usePageManager, type InitialPageDef } from '../usePageManager.js';

import '../../testing/fixtureTemplates';

const PHOTO = 'https://example.org/photo.jpg';

/** A page-level binding of a background field, and one of a field that is not. */
const BACKGROUND_BINDING = { backgroundColor: { ref: 'color.surface', value: '#123456' } };
const TEXT_BINDING = { textColor: { ref: 'color.ink', value: '#111111' } };

const BRAND = {
  bind: { ...BACKGROUND_BINDING, ...TEXT_BINDING },
  brandScheme: 'light',
  brandStamp: 'a1b2c3d4',
  colorScheme: 'dark',
  colorSchemeId: 'tanne',
};

const BACKGROUND = {
  backgroundMode: 'image',
  currentImageSrc: PHOTO,
  imageOffset: { x: 40, y: 0 },
  imageAttribution: { photographer: 'Jo', source: 'unsplash' },
  backgroundColor: '#123456',
};

const photoPage: InitialPageDef = {
  configId: 'fixture-poster',
  state: { line1: 'Eins', ...BRAND, ...BACKGROUND },
};

let seed: MockInstance;

beforeEach(async () => {
  const config = await loadCanvasConfig('fixture-poster');
  seed = vi.spyOn(config, 'createInitialState');
});
afterEach(() => {
  seed.mockRestore();
});

/** What `createInitialState` got for the added page. */
async function seedOfAddedPage(
  inherit?: Parameters<ReturnType<typeof usePageManager>['addPage']>[1]
): Promise<Record<string, unknown>> {
  // One doc for the hook's whole life: a new one per render re-seeds forever.
  const ydoc = new Y.Doc();
  const { result } = renderHook(() =>
    usePageManager({
      initialConfigId: 'fixture-poster',
      initialProps: {},
      initialPages: [photoPage],
      collaborative: { ydoc, isSynced: true },
    })
  );
  seed.mockClear();
  await act(async () => {
    await result.current.addPage('fixture-poster', inherit);
  });
  expect(result.current.pages).toHaveLength(2);
  expect(seed).toHaveBeenCalledOnce();
  return seed.mock.calls[0]![0] as Record<string, unknown>;
}

describe('addPage inheritance', () => {
  it('carries background and brand over by default, as before', async () => {
    const props = await seedOfAddedPage();
    expect(props).toMatchObject({ ...BRAND, ...BACKGROUND, imageSrc: PHOTO });
  });

  it('carries nothing over with false, as before', async () => {
    const props = await seedOfAddedPage(false);
    for (const key of [...Object.keys(BRAND), ...Object.keys(BACKGROUND), 'imageSrc']) {
      expect(props).not.toHaveProperty(key);
    }
  });

  it('carries the brand without the background when asked to', async () => {
    const props = await seedOfAddedPage({ brand: true, background: false });
    const { bind: _bind, ...brandWithoutBind } = BRAND;
    expect(props).toMatchObject(brandWithoutBind);
    for (const key of [...Object.keys(BACKGROUND), 'imageSrc']) {
      expect(props).not.toHaveProperty(key);
    }
  });

  // The page keeps no background field, so a binding of one would describe a
  // value it does not have. Rebinding would not recolour it (the template's
  // colour reads as a hand edit and drops the binding), but under the
  // inherited brandStamp the stale binding stayed until the brand changed.
  it('keeps only the bindings of fields it carries when the background stays behind', async () => {
    const props = await seedOfAddedPage({ brand: true, background: false });
    expect(props.bind).toEqual(TEXT_BINDING);
  });

  it('carries the background without the brand when asked to', async () => {
    const props = await seedOfAddedPage({ brand: false, background: true });
    expect(props).toMatchObject({ ...BACKGROUND, imageSrc: PHOTO });
    for (const key of Object.keys(BRAND)) {
      expect(props).not.toHaveProperty(key);
    }
  });
});
