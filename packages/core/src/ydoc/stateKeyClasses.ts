// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Which page-state keys are stored as Yjs structures from document version 4, and the reserved
 * names of that format. Normative: `packages/schema/DOCUMENT_VERSIONING.md`, "Version 4". Every
 * name and every key's class here is stored in documents (F0): a key may join a class later,
 * never leave one or change it.
 *
 * Only the lift and the first structured write of a key read these lists. A reader follows the
 * `$kind` entry each structured value carries, so it needs no list at all.
 */

/** The class of a structured state value; stored as `$kind`. F0. */
export type StateKeyClass = 'elements' | 'order' | 'record';

/** Every class a reader of this build understands. */
export const STATE_KEY_CLASS_NAMES: readonly StateKeyClass[] = ['elements', 'order', 'record'];

/** The reserved entry of every structured `Y.Map` that names its class. F0. */
export const STATE_KIND_KEY = '$kind';
/** The reserved property of every element map in an `elements` value: its order key. F0. */
export const ELEMENT_POS_KEY = '$pos';
/** No element id, `order` id or record key starting with this is stored in a structure. F0. */
export const RESERVED_PREFIX = '$';
/**
 * The document version from which page state may hold structured values. Core does not depend
 * on the schema package, so the number is repeated here; the editor's guard test binds it to
 * `CANVAS_DOCUMENT_VERSION`.
 */
export const ELEMENT_STORAGE_VERSION = 4;

/** The core's element collections: `[{ id, …props }]`, one element map per id. */
export const CORE_ELEMENT_COLLECTION_KEYS = [
  'shapeInstances',
  'frameInstances',
  'additionalTexts',
  'illustrationInstances',
  'assetInstances',
  'circleBadgeInstances',
  'pillBadgeInstances',
  'userImageInstances',
  'chartInstances',
] as const;

/** Id lists whose order is visible: id → fractional order key. */
export const ORDERED_ID_KEYS = ['layerOrder', 'selectedIcons', 'lockedLayerIds'] as const;

/** Records whose entries are independent: key → one plain JSON value. */
export const RECORD_KEYS = ['iconStates', 'templateRotations', 'templateTextAligns'] as const;

/** Which key is which class; plain keys are absent. */
export type StateKeyClasses = ReadonlyMap<string, StateKeyClass>;

const CORE_CLASSES: ReadonlyMap<string, StateKeyClass> = new Map<string, StateKeyClass>([
  ...CORE_ELEMENT_COLLECTION_KEYS.map((key) => [key, 'elements'] as const),
  ...ORDERED_ID_KEYS.map((key) => [key, 'order'] as const),
  ...RECORD_KEYS.map((key) => [key, 'record'] as const),
]);

/**
 * The core's classes plus a host's collection keys (its element kinds' `stateKey`s), which are
 * `elements`. A host key the core classes as `order` or `record` is a mistake and throws: the
 * class of a key never changes.
 */
export function stateKeyClasses(hostCollectionKeys: readonly string[] = []): StateKeyClasses {
  if (hostCollectionKeys.length === 0) return CORE_CLASSES;
  const classes = new Map(CORE_CLASSES);
  for (const key of hostCollectionKeys) {
    const known = classes.get(key);
    if (known !== undefined && known !== 'elements') {
      throw new Error(`stateKeyClasses: '${key}' is a core '${known}' key, not a collection`);
    }
    classes.set(key, 'elements');
  }
  return classes;
}
