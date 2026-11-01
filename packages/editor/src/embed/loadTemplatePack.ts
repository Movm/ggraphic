// SPDX-License-Identifier: MPL-2.0
import { type TemplatePack } from '../page/templatePack.js';

/**
 * `templatePackFromJson` in its own chunk. Reading template files needs the schema validators
 * and the page config, several hundred kB that a host's entry chunk would otherwise carry; this
 * loads them alongside the editor. Pass the promise to `GgraphicEditor` as it is, and await it
 * for `problems`.
 */
export function loadTemplatePack(json: unknown): Promise<TemplatePack> {
  return import('../page/templatePack.js').then((m) => m.templatePackFromJson(json));
}
