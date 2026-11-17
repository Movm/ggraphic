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

import { buildStructured, representable } from './codec.js';
import { type StateKeyClasses } from './stateKeyClasses.js';
import { YDOC_KEYS } from './ydocKeys.js';

/** Lift every classed key of one state map that holds a representable plain value. Returns the lifted keys. */
export function liftStateMap(stateY: Y.Map<unknown>, classes: StateKeyClasses): string[] {
  const lifted: string[] = [];
  const run = () => {
    for (const key of Array.from(stateY.keys())) {
      const cls = classes.get(key);
      if (cls === undefined) continue;
      const value = stateY.get(key);
      if (value instanceof Y.AbstractType || !representable(cls, value)) continue;
      stateY.set(key, buildStructured(cls, value));
      lifted.push(key);
    }
  };
  if (stateY.doc === null) run();
  else stateY.doc.transact(run);
  return lifted;
}

/**
 * `liftStateMap` over every page of `pagesById`; returns the number of keys lifted. Call inside
 * the setup transaction that also raises the stamp, so peers receive both in one update.
 */
export function liftDocumentState(doc: Y.Doc, classes: StateKeyClasses): number {
  let count = 0;
  doc.transact(() => {
    doc.getMap<unknown>(YDOC_KEYS.pagesById).forEach((page) => {
      if (!(page instanceof Y.Map)) return;
      const stateY: unknown = page.get(YDOC_KEYS.state);
      if (stateY instanceof Y.Map) count += liftStateMap(stateY as Y.Map<unknown>, classes).length;
    });
  });
  return count;
}
