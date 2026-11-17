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
 * client's edit (#160). That is the value the write replaced here — except
 * when it replaced this client's own write without having seen it (#176,
 * last writer wins per key). Then the own write is no part of the remote
 * edit: the base is the last own value the writer did see, or else the value
 * the own writes replaced. The writer's history is read from the items
 * themselves: a Y.Map set records the item it replaced as its `origin`.
 *
 * Own writes with another origin (a deck op, a deck undo's restore, a version
 * lift) reach the canvas like remote ones: another stack owns them or they
 * are not undoable, so the canvas history takes them in. They are reported
 * with `own: true` (a local Yjs transaction): the history takes them in only
 * where it still holds the value they replaced, so undoing a deck op leaves
 * the steps before it undoable.
 */
/** Own values kept per key, to name the one a remote write started from. */
const OWN_VALUES_PER_KEY = 32;

export function useYjsPageStateSync(options: {
  pageYMap: Y.Map<unknown> | null;
  isSynced: boolean;
  onRemoteState: (
    partial: Record<string, unknown>,
    base: Record<string, unknown>,
    own: boolean
  ) => void;
}): void {
  const { pageYMap, isSynced, onRemoteState } = options;
  const onRemoteStateRef = useRef(onRemoteState);
  onRemoteStateRef.current = onRemoteState;

  useEffect(() => {
    if (!pageYMap || !isSynced) return undefined;

    // Read per use: Yjs gives a doc a new client id when it finds its own in use.
    const me = () => pageYMap.doc?.clientID;
    const idOf = (id: Y.ID) => `${id.client}:${id.clock}`;
    // Per key: whether the value held now is an own write, the values of the
    // latest own writes by item id, and the value (with its item) the current
    // run of own writes replaced.
    const holdsOwn = new Map<string, boolean>();
    const ownValues = new Map<string, Map<string, unknown>>();
    const runStart = new Map<string, { item: string | null; value: unknown }>();

    const track = (stateY: Y.Map<unknown>, key: string, replaced: unknown) => {
      const item = stateY._map.get(key);
      const own = !!item && !item.deleted && item.id.client === me();
      if (own) {
        if (!holdsOwn.get(key))
          runStart.set(key, { item: item.origin && idOf(item.origin), value: replaced });
        const values = ownValues.get(key) ?? new Map<string, unknown>();
        values.set(idOf(item.id), stateY.get(key));
        if (values.size > OWN_VALUES_PER_KEY) values.delete(values.keys().next().value!);
        ownValues.set(key, values);
      }
      holdsOwn.set(key, own);
    };
    const initial = pageYMap.get(YDOC_KEYS.state);
    if (initial instanceof Y.Map)
      for (const key of initial.keys()) track(initial, key, initial.get(key));

    /**
     * The base of `item`'s write, which replaced an own write it may not have
     * seen: the last own value on its way back, or what the own run replaced
     * once the walk reaches that — also when the own value seen is no longer kept.
     */
    const baseOverOwn = (stateY: Y.Map<unknown>, key: string, item: Y.Item) => {
      const store = stateY.doc!.store;
      const start = runStart.get(key);
      const values = ownValues.get(key);
      for (let id = item.origin; id;) {
        const at = idOf(id);
        if (at === start?.item) break;
        if (id.client === me() && values?.has(at)) return values.get(at);
        const struct = Y.getItem(store, id);
        if (!(struct instanceof Y.Item)) break;
        id = struct.origin;
      }
      return start?.value;
    };

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
            const item = stateY._map.get(key);
            const overOwn =
              holdsOwn.get(key) === true && !!item && !item.deleted && item.id.client !== me();
            partial[key] = stateY.get(key);
            base[key] = overOwn ? baseOverOwn(stateY, key, item) : change.oldValue;
          }
          track(stateY, key, change.oldValue);
        }
      }
      if (Object.keys(partial).length > 0)
        onRemoteStateRef.current(partial, base, events[0]!.transaction.local);
    };

    pageYMap.observeDeep(handler);
    return () => {
      pageYMap.unobserveDeep(handler);
    };
  }, [pageYMap, isSynced]);
}
