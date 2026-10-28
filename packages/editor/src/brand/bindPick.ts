// SPDX-License-Identifier: MPL-2.0
/**
 * What a colour pick does to a field's binding: a brand swatch carries the
 * role it stands for and binds the field to it; any other pick (a custom
 * colour, a host's own swatch) takes the field off the brand again. The other
 * fields keep their bindings.
 */
import { withBinding, withoutBinding, type BindingRef, type Bindings } from '@ggraphic/core';

/**
 * The `bind` part of a patch that sets `field` to `color`. Empty when the pick
 * leaves the bindings as they are, so a free pick on an unbound field adds no key.
 * `bind: undefined` is what removes the last binding: the update actions
 * spread a patch over the instance, which cannot delete a key.
 */
export function bindPatch(
  bind: Bindings | undefined,
  field: string,
  color: string,
  ref?: BindingRef
): { bind?: Bindings | undefined } {
  if (ref) return { bind: withBinding(bind, field, { ref, value: color }) };
  if (bind?.[field]) return { bind: withoutBinding(bind, field) };
  return {};
}

/** The page state after `key` was set to `color`, its own `bind` updated and dropped when empty. */
export function withPageColor<S extends Record<string, unknown>>(
  state: S,
  key: string,
  color: string,
  ref?: BindingRef
): S {
  const { bind, ...rest } = state as Record<string, unknown> & { bind?: Bindings };
  const patch = bindPatch(bind, key, color, ref);
  const nextBind = 'bind' in patch ? patch.bind : bind;
  return { ...rest, [key]: color, ...(nextBind ? { bind: nextBind } : {}) } as S;
}
