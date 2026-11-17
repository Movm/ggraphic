// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The size a text is being scaled to by a corner handle, while the pointer is still down.
 *
 * A channel of its own, not a field of the canvas store: every page has its own store, and the
 * size field sits in the shell's toolbar, outside all of them. Only the field subscribes, so a
 * drag re-renders that one input — once per whole size step — and nothing else. The page itself
 * is written once, on release.
 */
import { useSyncExternalStore } from 'react';

let live: { id: string; size: number } | null = null;
const listeners = new Set<() => void>();

export function setLiveFontSize(next: { id: string; size: number } | null): void {
  if (next?.id === live?.id && next?.size === live?.size) return;
  live = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The live size of `id` while one of its corners is dragged; null otherwise. */
export function useLiveFontSize(id: string): number | null {
  return useSyncExternalStore(
    subscribe,
    () => (live?.id === id ? live.size : null),
    () => null
  );
}
