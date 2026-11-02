// SPDX-License-Identifier: AGPL-3.0-only
/**
 * "Change template" on a page whose config does not change (every free page): the host hands
 * the new state, and the page takes it as one undoable step. Without a state, the same config
 * is still a no-op.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { getMetaMap, seedPagesIfEmpty } from '../../collab/pagesDoc.js';
import { YDOC_KEYS } from '../../collab/ydocKeys.js';
import { usePageManager } from '../usePageManager.js';

function open() {
  const ydoc = new Y.Doc();
  seedPagesIfEmpty(ydoc, [{ id: 'p1', configId: 'freeform', state: { headline: 'Eins' } }]);
  getMetaMap(ydoc).set(YDOC_KEYS.formStateFolded, true);
  getMetaMap(ydoc).set(YDOC_KEYS.schemaVersion, 3);
  return renderHook(() =>
    usePageManager({
      initialConfigId: 'freeform',
      initialProps: {},
      collaborative: { ydoc, isSynced: true },
    })
  );
}

describe('setPageConfig with a state', () => {
  it('replaces the state of a page whose config stays, and undo brings it back', async () => {
    const { result } = open();
    await act(async () => {
      await result.current.setPageConfig('p1', 'freeform', { headline: 'Neu' });
    });
    expect(result.current.pages[0]!.state.headline).toBe('Neu');
    act(() => result.current.undoPageOp());
    expect(result.current.pages[0]!.state.headline).toBe('Eins');
  });

  it('is still a no-op for the same config without a state', async () => {
    const { result } = open();
    await act(async () => {
      await result.current.setPageConfig('p1', 'freeform');
    });
    expect(result.current.pages[0]!.state.headline).toBe('Eins');
  });
});
