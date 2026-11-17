// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Soft problems of page-state writes, for the host to observe. Today one: a key the format
 * stores as a structure was written as plain JSON, because its value cannot be one (duplicate
 * ids, an element without a string id, …; `PlainFallback`). The write goes ahead, the key stays
 * plain until a representable value is written, and a concurrent per-element edit of it by a peer
 * is lost (`DOCUMENT_VERSIONING.md`, "Version 4", "Risks"). Reported once per page state and key.
 */
import { type PlainFallback } from '@ggraphic/core/ydoc';

export type StateWriteWarning = { kind: 'plain-fallback' } & PlainFallback;

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

/** The codec's `onPlainFallback` for the editor's writes. */
export function reportPlainFallback(fallback: PlainFallback): void {
  const warning: StateWriteWarning = { kind: 'plain-fallback', ...fallback };
  if (listeners.size === 0) {
    console.warn(
      `[ggraphic] '${fallback.key}' is stored as plain JSON, not as a ${fallback.keyClass} structure: the value ${fallback.reason}`
    );
    return;
  }
  for (const listener of listeners) listener(warning);
}
