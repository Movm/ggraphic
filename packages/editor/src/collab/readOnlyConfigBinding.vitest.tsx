// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The config binding of a client that may not write (`collaborative.canWrite: false`): the
 * canvas store follows the page's stored `config`, also one a writer creates or edits later,
 * and nothing is written into the document, neither an empty `config` map nor the store's
 * values (review of #211, finding 1).
 */
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { useYjsCanvasBinding } from './useYjsCanvasBinding.js';
import { YDOC_KEYS } from './ydocKeys.js';
import { CanvasStoreProvider, useCanvasStore } from '../stores/CanvasStoreProvider.js';

import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore.js';

let store: CanvasEditorStoreApi | null = null;
function ReadOnlyBinding({ parent }: { parent: Y.Map<unknown> }) {
  store = useCanvasStore();
  useYjsCanvasBinding({ parent, isSynced: true, readOnly: true });
  return null;
}

function setup() {
  const doc = new Y.Doc();
  const page = new Y.Map<unknown>();
  doc.getMap(YDOC_KEYS.pagesById).set('p1', page);
  const writes: Uint8Array[] = [];
  doc.on('update', (u: Uint8Array, origin: unknown) => origin !== 'writer' && writes.push(u));
  render(
    <CanvasStoreProvider>
      <ReadOnlyBinding parent={page} />
    </CanvasStoreProvider>
  );
  return { doc, page, writes };
}

describe('a read-only config binding', () => {
  it('writes nothing for a page without config, and follows one a writer creates', () => {
    const { doc, page, writes } = setup();
    expect(page.has(YDOC_KEYS.config)).toBe(false);
    act(() =>
      doc.transact(() => {
        const config = new Y.Map<unknown>();
        config.set('width', 1234);
        page.set(YDOC_KEYS.config, config);
      }, 'writer')
    );
    expect(store!.getState().config.width).toBe(1234);
    act(() =>
      doc.transact(() => (page.get(YDOC_KEYS.config) as Y.Map<unknown>).set('width', 777), 'writer')
    );
    expect(store!.getState().config.width).toBe(777);
    expect(writes).toEqual([]);
  });

  it('does not write a change of its own store back', () => {
    const { writes } = setup();
    act(() => store!.getState().setConfig({ width: 42 }));
    expect(writes).toEqual([]);
  });
});
