// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The lift of document version 4: every key the classes name that still holds plain JSON the
 * structure can represent becomes one structure built from that JSON. The identity on the JSON
 * view (`readStateKey` returns what was there), deterministic (two clients lifting the same JSON
 * write equal content) and idempotent (a structured key is left alone).
 *
 * The caller decides when: on open, by a client that may write the document, in the transaction
 * that raises the stamp to 4 (rule 2 of "Version 4" in `packages/schema/DOCUMENT_VERSIONING.md`).
 */
import * as Y from 'yjs';

import {
  buildStructured,
  reportIfPlainFallback,
  representable,
  type PlainFallback,
} from './codec.js';
import { type StateKeyClasses } from './stateKeyClasses.js';
import { YDOC_KEYS } from './ydocKeys.js';

export interface LiftOptions {
  /** Called once per state map and key the classes name whose value stays plain (see `PlainFallback`). */
  onPlainFallback?: (fallback: PlainFallback) => void;
}

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Lift every classed key of one state map that holds a representable plain value. Returns the
 * lifted keys. The keys are lifted in code-point order and each structure is built canonically,
 * so the writes are a pure function of the map's content: two replicas of one document state
 * lift it into identical Yjs structs (`transactDeterministically`).
 */
export function liftStateMap(
  stateY: Y.Map<unknown>,
  classes: StateKeyClasses,
  options: LiftOptions = {}
): string[] {
  const lifted: string[] = [];
  const run = () => {
    for (const key of Array.from(stateY.keys()).sort(byCodePoint)) {
      const cls = classes.get(key);
      if (cls === undefined) continue;
      const value = stateY.get(key);
      if (value instanceof Y.AbstractType) continue;
      if (!representable(cls, value)) {
        reportIfPlainFallback(stateY, key, value, cls, false, options.onPlainFallback);
        continue;
      }
      stateY.set(key, buildStructured(cls, value, true));
      lifted.push(key);
    }
  };
  if (stateY.doc === null) run();
  else stateY.doc.transact(run);
  return lifted;
}

/**
 * `liftStateMap` over every page of `pagesById`, pages in code-point order of their ids; returns
 * the number of keys lifted. Call inside the setup transaction that also raises the stamp, so
 * peers receive both in one update.
 */
export function liftDocumentState(
  doc: Y.Doc,
  classes: StateKeyClasses,
  options: LiftOptions = {}
): number {
  let count = 0;
  doc.transact(() => {
    const pages = doc.getMap<unknown>(YDOC_KEYS.pagesById);
    for (const id of Array.from(pages.keys()).sort(byCodePoint)) {
      const page = pages.get(id);
      if (!(page instanceof Y.Map)) continue;
      const stateY: unknown = page.get(YDOC_KEYS.state);
      if (stateY instanceof Y.Map) {
        count += liftStateMap(stateY as Y.Map<unknown>, classes, options).length;
      }
    }
  });
  return count;
}
