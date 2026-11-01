// SPDX-License-Identifier: MPL-2.0
/**
 * The message catalogue without React: the register and `messages()`. Data modules (formats,
 * factories, chart and placeholder texts) read texts from here, so the entries built from them load
 * without React. `./messages` is the full surface: these plus the types and `useMessages`.
 */
import { de, type Messages as CoreMessages } from './de.js';
import { en } from './en.js';
import { type HostMessages, type MessageLocale, type Messages } from './messages.js';

const BUILT_IN: Readonly<Record<MessageLocale, CoreMessages>> = { de, en };

let base: CoreMessages = de;
let baseLocale: MessageLocale = 'de';
let hostTexts: Partial<Record<MessageLocale, HostMessages>> = {};
let registered = de as Messages;
const listeners = new Set<() => void>();

type Tree = Record<string, unknown>;
const isTree = (value: unknown): value is Tree =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `over` laid into `under`, branch by branch; `under` wins where both have a leaf. */
function nest(under: Tree, over: Tree): Tree {
  const out: Tree = { ...over, ...under };
  for (const [key, value] of Object.entries(over)) {
    const own = under[key];
    if (isTree(own) && isTree(value)) out[key] = nest(own, value);
  }
  return out;
}

function update(): void {
  const host = hostTexts[baseLocale] ?? hostTexts.de;
  // Boundary: the host's texts complete the catalogue to `Messages`.
  registered = (host ? nest(base as Tree, host as unknown as Tree) : base) as Messages;
  for (const listener of listeners) listener();
}

/**
 * A built-in locale, or a host's own catalogue of the same shape. A host
 * catalogue counts as German for the host's texts unless it brings them.
 */
export function registerMessages(source: MessageLocale | CoreMessages): void {
  base = typeof source === 'string' ? BUILT_IN[source] : source;
  baseLocale = typeof source === 'string' ? source : 'de';
  update();
}

/** The host's texts per locale (`HostMessages`); German is the fallback. */
export function registerHostMessages(
  texts: { de: HostMessages } & Partial<Record<MessageLocale, HostMessages>>
): void {
  hostTexts = texts;
  update();
}

/** The language of the built-in catalogue in use; a host's own catalogue counts as German. */
export function messageLocale(): MessageLocale {
  return baseLocale;
}

/** The active catalogue, for code outside React. */
export function messages(): Messages {
  return registered;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
