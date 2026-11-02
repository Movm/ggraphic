// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';

import { YDOC_KEYS } from './ydocKeys.js';

import { PAGES_STATE_ORIGIN } from './useYjsPages.js';

/**
 * Push external changes of a page's `state` Y.Map into the mounted canvas.
 *
 * GenericCanvas holds template-field state as local React state seeded once
 * from `page.state` — without this observer neither a chat sharepic edit
 * (applied server-side via the Hocuspocus internal API) nor another studio
 * client's edit (dual-written into the page state map by CanvasEditor) would
 * appear in an open studio tab until reload.
 *
 * This client's own dual-writes carry PAGES_STATE_ORIGIN and are skipped —
 * the local component state already has those values, and rebuilding it on
 * every keystroke would disrupt inline text editing. Structural page ops are
 * not skipped: the carousel chrome they rewrite is news to the canvas.
 *
 * Next to each changed value the hook reports the value the writer started
 * from (`base`), so the canvas can tell which part of a write is the other
 * client's edit (#160). That is the value the write replaced in this doc —
 * unless the writer had not seen this client's latest write to the key yet.
 * Then its write replaced the value before that one, and the difference to it
 * is all the writer changed; the difference to this client's own write would
 * also contain that write's undoing (#176, last writer wins per key).
 */
/** Enough to find the value a write started from while a few writes cross in flight. */
const SEEN_PER_KEY = 8;

export function useYjsPageStateSync(options: {
  pageYMap: Y.Map<unknown> | null;
  isSynced: boolean;
  onRemoteState: (partial: Record<string, unknown>, base: Record<string, unknown>) => void;
}): void {
  const { pageYMap, isSynced, onRemoteState } = options;
  const onRemoteStateRef = useRef(onRemoteState);
  onRemoteStateRef.current = onRemoteState;

  useEffect(() => {
    if (!pageYMap || !isSynced) return undefined;

    // The last values each key held, by the id of the Yjs item that wrote them.
    const seen = new Map<string, { item: string; value: unknown }[]>();
    const idOf = (id: Y.ID) => `${id.client}:${id.clock}`;
    const remember = (stateY: Y.Map<unknown>, key: string) => {
      const item = stateY._map.get(key);
      if (!item || item.deleted) return;
      const values = seen.get(key) ?? [];
      values.push({ item: idOf(item.id), value: stateY.get(key) });
      seen.set(key, values.slice(-SEEN_PER_KEY));
    };
    const initial = pageYMap.get(YDOC_KEYS.state);
    if (initial instanceof Y.Map) for (const key of initial.keys()) remember(initial, key);

    const handler = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
      const stateY = pageYMap.get(YDOC_KEYS.state);
      if (!(stateY instanceof Y.Map)) return;
      const partial: Record<string, unknown> = {};
      const base: Record<string, unknown> = {};
      for (const event of events) {
        if (event.target !== stateY) continue;
        const own = event.transaction.origin === PAGES_STATE_ORIGIN;
        for (const [key, change] of (event as Y.YMapEvent<unknown>).changes.keys) {
          if (!own) {
            // A set's item records the item it replaced as its origin (Y.Map: `left.lastId`).
            const origin = change.action === 'delete' ? null : stateY._map.get(key)?.origin;
            const from = origin && seen.get(key)?.find((v) => v.item === idOf(origin));
            partial[key] = stateY.get(key);
            base[key] = from ? from.value : change.oldValue;
          }
          remember(stateY, key);
        }
      }
      if (Object.keys(partial).length > 0) onRemoteStateRef.current(partial, base);
    };

    pageYMap.observeDeep(handler);
    return () => {
      pageYMap.unobserveDeep(handler);
    };
  }, [pageYMap, isSynced]);
}
