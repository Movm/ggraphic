// SPDX-License-Identifier: MPL-2.0
/**
 * The message catalogue the editor renders with. A module-level register, like
 * the brand packs and the asset catalogue, because commands, factories and
 * offscreen roots read texts with no React context. Without a host the editor
 * speaks German (`de`). Register before the first render; switching later
 * re-renders `useMessages()` consumers, while texts already stored in
 * module-level data are read lazily and follow too.
 */
import { useSyncExternalStore } from 'react';

import { messages, subscribe } from './catalogue.js';
import { type Messages as CoreMessages } from './de.js';

export { messageLocale, messages, registerHostMessages, registerMessages } from './catalogue.js';

export type MessageLocale = 'de' | 'en';

/**
 * Texts a host adds for its own parts of the editor (its element kinds, their
 * sections). Empty in the core; a host augments it
 * (`declare module '@ggraphic/editor/host'`) and registers the texts
 * per locale with `registerHostMessages`. They nest into the catalogue, so a
 * host text is read like a core one (`t.layers.…`).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HostMessages {}

/** The catalogue the editor reads: the core's texts and the host's. */
export type Messages = CoreMessages & HostMessages;

/** The active catalogue, for components. */
export function useMessages(): Messages {
  return useSyncExternalStore(subscribe, messages, messages);
}
