// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Soft problems of page-state writes, for the host to observe. Today one: a key the format
 * stores as a structure was written as plain JSON, because its value cannot be one (duplicate
 * ids, an element without a string id, …; `PlainFallback`). The write goes ahead, the key stays
 * plain until a representable value is written, and a concurrent per-element edit of it by a peer
 * is lost (`DOCUMENT_VERSIONING.md`, "Version 4", "Risks"). Reported once per page state and key.
 *
 * A warning reaches the listeners only after the write it is about has finished (the codec's
 * `runAfterWrite`): never inside the write's transaction, never under the deterministic lift's
 * client id. A listener may write to the document; one that throws is reported with
 * `console.error` and does not affect the write or the other listeners.
 */
import { runAfterWrite, type PlainFallback } from '@ggraphic/core/ydoc';

import type * as Y from 'yjs';

export type StateWriteWarning = {
  kind: 'plain-fallback';
  /** The document the write went to. */
  doc: Y.Doc;
} & PlainFallback;

const listeners = new Set<(warning: StateWriteWarning) => void>();

/**
 * Observe the warnings of page-state writes. Returns the unsubscribe. While no listener is
 * registered, the editor reports them with `console.warn`.
 */
export function onStateWriteWarning(listener: (warning: StateWriteWarning) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(warning: StateWriteWarning): void {
  if (listeners.size === 0) {
    console.warn(
      `[ggraphic] '${warning.key}' is stored as plain JSON, not as a ${warning.keyClass} structure: the value ${warning.reason}`
    );
    return;
  }
  for (const listener of [...listeners]) {
    try {
      listener(warning);
    } catch (error) {
      console.error('[ggraphic] a state write warning listener threw:', error);
    }
  }
}

/** The codec's `onPlainFallback` for the editor's writes into `doc`. */
export const plainFallbackReporter =
  (doc: Y.Doc) =>
  (fallback: PlainFallback): void =>
    // The codec already defers; a map built outside the document (`buildStateMap`) reports at
    // once, so defer again to the end of the transaction that integrates it.
    runAfterWrite(doc, () => notify({ kind: 'plain-fallback', doc, ...fallback }));
