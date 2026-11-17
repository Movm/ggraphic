// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The page-state codec of document version 4: reads a page's `state` Y.Map as the version 3
 * JSON, whatever form each key is stored in, and writes JSON back into it, diffing a structured
 * key into its structure. Normative: `packages/schema/DOCUMENT_VERSIONING.md`, "Version 4".
 *
 * Stored forms of one state key:
 * - plain: the JSON value itself (every key before version 4, and every key no class names);
 * - `elements`: `Y.Map` with `$kind: 'elements'`, then id → element `Y.Map` (one entry per
 *   property, its value plain JSON, plus `$pos`); reads as `[{ id, …props }]` in (`$pos`, id)
 *   order;
 * - `order`: `Y.Map` with `$kind: 'order'`, then id → fractional key; reads as `string[]` in
 *   (key, id) order;
 * - `record`: `Y.Map` with `$kind: 'record'`, then key → plain JSON; reads as an object.
 *
 * Reads of structured values are memoised per `Y.Map` with structural sharing: an unchanged
 * collection keeps its array, an unchanged element its object, until a transaction changes them.
 * Callers must not mutate what they read (plain values are the stored objects, as Yjs hands them
 * out).
 */
import * as Y from 'yjs';

import { isValidPos, posBetween, posJitter } from './pos.js';
import {
  ELEMENT_POS_KEY,
  ELEMENT_STORAGE_VERSION,
  RESERVED_PREFIX,
  STATE_KEY_CLASS_NAMES,
  STATE_KIND_KEY,
  type StateKeyClass,
  type StateKeyClasses,
} from './stateKeyClasses.js';
import { YDOC_KEYS } from './ydocKeys.js';

type PlainObject = Record<string, unknown>;
type Element = PlainObject & { id: string };

// ── equality ────────────────────────────────────────────────────────────────

const canonicalJson = (value: unknown): string | undefined =>
  JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as PlainObject).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : v
  );

/**
 * Equal as stored JSON: object key order and `undefined` members don't count
 * — a value that crossed the wire comes back JSON-decoded. A value that is not JSON is equal
 * only to itself.
 */
export const sameStateValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  try {
    return canonicalJson(a) === canonicalJson(b);
  } catch {
    // Not JSON (a BigInt, a cycle): unequal, so a writer replaces it instead of throwing midway.
    return false;
  }
};

// ── what a structure can hold ───────────────────────────────────────────────

const isPlainObject = (value: unknown): value is PlainObject => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

const reserved = (name: string): boolean => name.startsWith(RESERVED_PREFIX);

const isElementList = (value: unknown): value is Element[] => {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const element of value) {
    if (!isPlainObject(element)) return false;
    const id = element['id'];
    if (typeof id !== 'string' || reserved(id) || ids.has(id)) return false;
    if (Object.hasOwn(element, ELEMENT_POS_KEY)) return false;
    ids.add(id);
  }
  return true;
};

const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((id) => typeof id === 'string' && !reserved(id)) &&
  new Set(value).size === value.length;

const isRecord = (value: unknown): value is PlainObject =>
  isPlainObject(value) && Object.keys(value).every((key) => !reserved(key));

/** Can `value` be stored as a structure of class `cls`? What cannot stays plain JSON. */
export function representable(cls: StateKeyClass, value: unknown): boolean {
  switch (cls) {
    case 'elements':
      return isElementList(value);
    case 'order':
      return isIdList(value);
    case 'record':
      return isRecord(value);
  }
}

// ── reading ─────────────────────────────────────────────────────────────────

/** The class a `Y.Map` names; `null` without `$kind`, `'unknown'` for a class this build lacks. */
function classOf(map: Y.Map<unknown>): StateKeyClass | 'unknown' | null {
  if (!map.has(STATE_KIND_KEY)) return null;
  const kind = map.get(STATE_KIND_KEY);
  return (STATE_KEY_CLASS_NAMES as readonly unknown[]).includes(kind)
    ? (kind as StateKeyClass)
    : 'unknown';
}

const plainOf = (value: unknown): unknown =>
  value instanceof Y.AbstractType ? (value.toJSON() as unknown) : value;

/**
 * The read memo. Structured map → its plain value; element map → its plain element.
 *
 * Guarantee: an entry is filled and served only while the doc is quiescent for the codec: no
 * transaction is open (`doc._transaction`), and every transaction Yjs still has to clean up
 * (`doc._transactionCleanups`) has already passed `invalidate`. `invalidate` runs on each
 * transaction's `beforeObserverCalls` and drops every type in `transaction.changed` and all its
 * ancestors. Every change to a Yjs type happens inside a transaction that is in that list until
 * its cleanup has run, so no entry is served while a write it has not seen exists: not inside a
 * transaction, not for a transaction an observer, `afterTransaction` or `update` handler
 * started (Yjs queues it behind the running cleanup), not for a `beforeObserverCalls` listener
 * that runs before the codec's. A type created in a transaction is not in `changed`, but it was
 * never cached either. A destroyed doc is never cached (its listeners are gone).
 *
 * Relies on: `transaction.changed` listing every pre-existing type a transaction changed, and on
 * the `_transaction`, `_transactionCleanups` and `_item.parent` fields of yjs 13.6.
 */
const valueCache = new WeakMap<object, unknown>();
const elementCache = new WeakMap<object, Element>();
const watchedDocs = new WeakSet<Y.Doc>();
const invalidated = new WeakSet<Y.Transaction>();

function invalidate(transaction: Y.Transaction): void {
  const seen = new Set<object>();
  for (const changed of transaction.changed.keys()) {
    let type: Y.AbstractType<unknown> | null = changed as Y.AbstractType<unknown>;
    while (type !== null && !seen.has(type)) {
      seen.add(type);
      valueCache.delete(type);
      elementCache.delete(type);
      const parent: unknown = type._item?.parent;
      type = parent instanceof Y.AbstractType ? (parent as Y.AbstractType<unknown>) : null;
    }
  }
  invalidated.add(transaction);
}

/** May a read of `map` use and fill the caches? See the guarantee above. */
function cacheable(map: Y.Map<unknown>): boolean {
  const doc = map.doc;
  if (doc === null || doc.isDestroyed) return false;
  if (!watchedDocs.has(doc)) {
    // Transactions already in flight were not seen by `invalidate`, so the check below keeps
    // the caches off until they are cleaned up.
    watchedDocs.add(doc);
    doc.on('beforeObserverCalls', invalidate);
  }
  if (doc._transaction !== null) return false;
  return doc._transactionCleanups.every((transaction) => invalidated.has(transaction));
}

/** An own, enumerable property of any name, `__proto__` included. */
const define = (target: PlainObject, key: string, value: unknown): void => {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
};

/** An order key as read: a missing or malformed one sorts first. */
const keyOf = (value: unknown): string => (typeof value === 'string' ? value : '');

const byKeyThenId = (a: [string, string], b: [string, string]): number =>
  a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;

function readElement(map: Y.Map<unknown>, id: string, useCache: boolean): Element {
  if (useCache) {
    const cached = elementCache.get(map);
    if (cached !== undefined) return cached;
  }
  const element: Element = { id };
  map.forEach((value, key) => {
    if (key !== ELEMENT_POS_KEY && key !== 'id') define(element, key, plainOf(value));
  });
  if (useCache) elementCache.set(map, element);
  return element;
}

function readElements(map: Y.Map<unknown>, useCache: boolean): Element[] {
  const order: [string, string][] = [];
  const maps = new Map<string, Y.Map<unknown>>();
  map.forEach((value, id) => {
    // Only element maps are elements; no writer puts anything else beside `$kind`.
    if (id === STATE_KIND_KEY || !(value instanceof Y.Map)) return;
    maps.set(id, value);
    order.push([id, keyOf(value.get(ELEMENT_POS_KEY))]);
  });
  return order.sort(byKeyThenId).map(([id]) => readElement(maps.get(id)!, id, useCache));
}

function readOrder(map: Y.Map<unknown>): string[] {
  const order: [string, string][] = [];
  map.forEach((value, id) => {
    if (id !== STATE_KIND_KEY) order.push([id, keyOf(value)]);
  });
  return order.sort(byKeyThenId).map(([id]) => id);
}

function readRecord(map: Y.Map<unknown>): PlainObject {
  const record: PlainObject = {};
  map.forEach((value, key) => {
    if (key !== STATE_KIND_KEY) define(record, key, plainOf(value));
  });
  return record;
}

const isUnreadable = (value: unknown): boolean =>
  value instanceof Y.Map && classOf(value) === 'unknown';

function readValue(value: unknown): unknown {
  if (!(value instanceof Y.AbstractType)) return value;
  if (!(value instanceof Y.Map)) return value.toJSON() as unknown;
  const map = value as Y.Map<unknown>;
  const cls = classOf(map);
  if (cls === null) return map.toJSON();
  if (cls === 'unknown') return undefined;
  const useCache = cacheable(map);
  if (useCache && valueCache.has(map)) return valueCache.get(map);
  const plain =
    cls === 'elements'
      ? readElements(map, useCache)
      : cls === 'order'
        ? readOrder(map)
        : readRecord(map);
  if (useCache) valueCache.set(map, plain);
  return plain;
}

/**
 * The plain JSON under `key`: exactly the version 3 value (up to the order of object keys).
 * `undefined` when absent, or when the key holds a structure of a class this build does not know
 * (a newer document; the build has refused it already).
 */
export function readStateKey(stateY: Y.Map<unknown>, key: string): unknown {
  return readValue(stateY.get(key));
}

/** Every key of the state map, read with `readStateKey`; an unreadable key is left out. */
export function readState(stateY: Y.Map<unknown>): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  stateY.forEach((value, key) => {
    if (!isUnreadable(value)) define(state, key, readValue(value));
  });
  return state;
}

// ── building ────────────────────────────────────────────────────────────────

function setProps(map: Y.Map<unknown>, element: Element): void {
  for (const [key, value] of Object.entries(element)) {
    if (key !== 'id') map.set(key, value);
  }
}

/**
 * A fresh structure of class `cls` holding `value` (which must be representable), its order on
 * the deterministic chain: two clients building the same JSON write equal content.
 */
export function buildStructured(cls: StateKeyClass, value: unknown): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set(STATE_KIND_KEY, cls);
  let pos: string | null = null;
  if (cls === 'elements') {
    for (const element of value as Element[]) {
      pos = posBetween(pos, null);
      const elementMap = new Y.Map<unknown>();
      setProps(elementMap, element);
      elementMap.set(ELEMENT_POS_KEY, pos);
      map.set(element.id, elementMap);
    }
  } else if (cls === 'order') {
    for (const id of value as string[]) {
      pos = posBetween(pos, null);
      map.set(id, pos);
    }
  } else {
    for (const [key, entry] of Object.entries(value as PlainObject)) map.set(key, entry);
  }
  return map;
}

// ── writing ─────────────────────────────────────────────────────────────────

export interface StateWriteOptions {
  /** Which key is which class: `stateKeyClasses(hostCollectionKeys)`. */
  classes: StateKeyClasses;
  /**
   * May a key the classes name, holding plain JSON or absent, be written structured?
   * True only in a document at ≥ ELEMENT_STORAGE_VERSION, or one stamped in the same
   * transaction (rule 1). `writeStateKeys` also checks the stamp itself; `buildStateMap`
   * builds a map outside any document and cannot. A key that is structured already is diffed
   * into its structure either way.
   */
  lift: boolean;
}

/** Indices into `seq` of one longest strictly increasing subsequence. */
function longestIncreasing(seq: readonly number[]): number[] {
  const tails: number[] = []; // index into seq of the smallest tail of each length
  const previous = new Array<number>(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]!]! < seq[i]!) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) previous[i] = tails[lo - 1]!;
    tails[lo] = i;
  }
  const out: number[] = [];
  for (let i = tails.length > 0 ? tails[tails.length - 1]! : -1; i !== -1; i = previous[i]!) {
    out.push(i);
  }
  return out.reverse();
}

/**
 * Every id on a fresh chain, each key jittered: two clients re-spacing the same list at once
 * must not mint equal keys for different ids, which would tie again. Only user writes re-space;
 * the lift and `buildStateMap` use the deterministic chain, so their convergence does not
 * depend on this.
 */
function respace(ids: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  let pos: string | null = null;
  for (const id of ids) {
    pos = posJitter(posBetween(pos, null));
    out.set(id, pos);
  }
  return out;
}

/**
 * The order keys to write so that `ids` reads back in this order. `current` holds the valid keys
 * (`isValidPos`) of the ids that have one; an id with a missing or malformed key counts as new. The ids on one longest run that is already in order keep their key;
 * every other id (moved or new) gets a jittered key between its new neighbours. When two
 * neighbours tie, the whole list is re-spaced first.
 */
function planPositions(
  ids: readonly string[],
  current: ReadonlyMap<string, string>
): Map<string, string> {
  const kept = ids.filter((id) => current.has(id));
  const ranked = [...kept].sort((a, b) => byKeyThenId([a, current.get(a)!], [b, current.get(b)!]));
  const rank = new Map(ranked.map((id, i) => [id, i]));
  const fixed = new Set(longestIncreasing(kept.map((id) => rank.get(id)!)).map((i) => kept[i]!));

  const nextFixed = new Array<string | null>(ids.length);
  let following: string | null = null;
  for (let i = ids.length - 1; i >= 0; i--) {
    nextFixed[i] = following;
    if (fixed.has(ids[i]!)) following = current.get(ids[i]!)!;
  }

  const out = new Map<string, string>();
  let previous: string | null = null;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    if (fixed.has(id)) {
      previous = current.get(id)!;
      continue;
    }
    const next = nextFixed[i]!;
    if (previous !== null && next !== null && previous >= next) return respace(ids);
    const pos = posJitter(posBetween(previous, next));
    out.set(id, pos);
    previous = pos;
  }
  return out;
}

function diffElements(map: Y.Map<unknown>, elements: readonly Element[]): void {
  const next = new Map(elements.map((element) => [element.id, element]));
  for (const id of Array.from(map.keys())) {
    if (id !== STATE_KIND_KEY && !next.has(id)) map.delete(id);
  }
  const current = new Map<string, string>();
  for (const element of elements) {
    const elementMap = map.get(element.id);
    if (!(elementMap instanceof Y.Map)) continue;
    for (const key of Array.from(elementMap.keys())) {
      if (key !== ELEMENT_POS_KEY && (key === 'id' || !Object.hasOwn(element, key))) {
        elementMap.delete(key);
      }
    }
    for (const [key, value] of Object.entries(element)) {
      if (key === 'id') continue;
      if (elementMap.has(key) && sameStateValue(plainOf(elementMap.get(key)), value)) continue;
      elementMap.set(key, value);
    }
    const pos = elementMap.get(ELEMENT_POS_KEY);
    if (isValidPos(pos)) current.set(element.id, pos);
  }
  const positions = planPositions(
    elements.map((element) => element.id),
    current
  );
  for (const [id, pos] of positions) {
    const existing = map.get(id);
    if (existing instanceof Y.Map) {
      existing.set(ELEMENT_POS_KEY, pos);
      continue;
    }
    const elementMap = new Y.Map<unknown>();
    setProps(elementMap, next.get(id)!);
    elementMap.set(ELEMENT_POS_KEY, pos);
    map.set(id, elementMap);
  }
}

function diffOrder(map: Y.Map<unknown>, ids: readonly string[]): void {
  const next = new Set(ids);
  const current = new Map<string, string>();
  for (const [id, pos] of Array.from(map.entries())) {
    if (id === STATE_KIND_KEY) continue;
    if (!next.has(id)) map.delete(id);
    else if (isValidPos(pos)) current.set(id, pos);
  }
  for (const [id, pos] of planPositions(ids, current)) map.set(id, pos);
}

function diffRecord(map: Y.Map<unknown>, record: PlainObject): void {
  for (const key of Array.from(map.keys())) {
    if (key !== STATE_KIND_KEY && !Object.hasOwn(record, key)) map.delete(key);
  }
  for (const [key, value] of Object.entries(record)) {
    if (map.has(key) && sameStateValue(plainOf(map.get(key)), value)) continue;
    map.set(key, value);
  }
}

function writeKey(
  stateY: Y.Map<unknown>,
  key: string,
  value: unknown,
  options: StateWriteOptions
): void {
  const current = stateY.get(key);
  const cls = current instanceof Y.Map ? classOf(current as Y.Map<unknown>) : null;
  if (cls === 'elements' || cls === 'order' || cls === 'record') {
    const map = current as Y.Map<unknown>;
    if (!representable(cls, value)) stateY.set(key, value);
    else if (cls === 'elements') diffElements(map, value as Element[]);
    else if (cls === 'order') diffOrder(map, value as string[]);
    else diffRecord(map, value as PlainObject);
    return;
  }
  // Plain, absent, or a Yjs value no writer creates: compared as its JSON view.
  if (sameStateValue(readValue(current), value)) return;
  const target = options.classes.get(key);
  stateY.set(
    key,
    options.lift && target !== undefined && representable(target, value)
      ? buildStructured(target, value)
      : value
  );
}

/**
 * Why `value` cannot be stored, or `null`: what `Y.Map.set` would throw on, or what would not
 * come back from a Yjs encode and decode as the same JSON. Read off yjs 13.6
 * (`typeMapSet`: which constructors a `set` accepts) and lib0's `writeAny` (how a value is
 * encoded at every depth). The codec hands Yjs an element property, a record entry or a whole
 * plain value, so every depth is checked the same way.
 *
 * Accepted: `null`, `undefined` (also inside arrays: it decodes as `undefined`, and an array
 * hole as `undefined` too), booleans, strings, numbers (`NaN` and `±Infinity` included: Yjs
 * stores them as float64 and decodes them unchanged, as version 3 stored them; the JSON view
 * reads them as `null` on every client alike), arrays (`Array` itself, not a subclass) and
 * plain objects (prototype `Object.prototype`) whose own keys are all enumerable strings.
 * The key `__proto__` only where it becomes a `Y.Map` key (an element property, a record entry);
 * inside an encoded value the decoder assigns it (`obj[key] = …`), so it would be lost.
 *
 * Rejected: a Yjs value; `bigint` (Yjs stores it, JSON cannot); functions and symbols (`set`
 * throws, nested they decode as `undefined`); `Date` (`set` accepts it, it decodes as `{}`);
 * `Uint8Array` (stored and decoded unchanged, but not JSON: every JSON consumer of the view
 * would read an index map) and every other typed array, `ArrayBuffer`, `Map`, `Set`, class
 * instances and boxed primitives (`set` throws, nested they decode as plain objects or index
 * maps); an object with a `null` prototype where it is handed to `set` itself (`set` throws;
 * nested it decodes as an equal plain object and is accepted); symbol or non-enumerable own keys
 * (dropped by the encoder); cycles.
 */
interface Placement {
  /** `value` is handed to `Y.Map.set` itself (not encoded inside another value). */
  direct: boolean;
  /** `value`'s own keys become `Y.Map` keys (an element, a record); its values are `direct`. */
  mapKeys: boolean;
}
const PLAIN_VALUE: Placement = { direct: true, mapKeys: false };
const MAP_KEYS: Placement = { direct: false, mapKeys: true };

function valueProblem(
  value: unknown,
  path: string,
  seen: Set<object>,
  at: Placement
): string | null {
  switch (typeof value) {
    case 'undefined':
    case 'boolean':
    case 'string':
    case 'number':
      return null;
    case 'bigint':
      return `${path} is a BigInt, not JSON`;
    case 'function':
      return `${path} is a function`;
    case 'symbol':
      return `${path} is a symbol`;
  }
  if (value === null) return null;
  const object = value as object;
  if (object instanceof Y.AbstractType) return `${path} is a Yjs value, not plain JSON`;
  if (seen.has(object)) return `${path} is a cycle`;
  const proto = Object.getPrototypeOf(object) as unknown;
  const isArray = Array.isArray(object) && proto === Array.prototype;
  const plainObject = proto === Object.prototype || (proto === null && !at.direct);
  if (!isArray && !plainObject) {
    const name = (object as { constructor?: { name?: unknown } }).constructor?.name;
    return `${path} is ${typeof name === 'string' && name !== '' ? `a ${name}` : 'an object without the plain prototype'}, not plain JSON`;
  }
  if (Object.getOwnPropertySymbols(object).length > 0) return `${path} has a symbol key`;
  seen.add(object);
  const child: Placement = { direct: at.mapKeys, mapKeys: false };
  try {
    if (isArray) {
      const array = object as unknown[];
      for (let i = 0; i < array.length; i++) {
        const problem = valueProblem(array[i], `${path}[${i}]`, seen, child);
        if (problem !== null) return problem;
      }
      return null;
    }
    const keys = Object.keys(object);
    if (Object.getOwnPropertyNames(object).length !== keys.length) {
      return `${path} has a non-enumerable key`;
    }
    if (!at.mapKeys && Object.hasOwn(object, '__proto__')) {
      return `${path} has a key named __proto__, which the encoder drops`;
    }
    for (const key of keys) {
      const problem = valueProblem((object as PlainObject)[key], `${path}.${key}`, seen, child);
      if (problem !== null) return problem;
    }
    return null;
  } finally {
    seen.delete(object);
  }
}

/**
 * Why `value` cannot be stored under `key` in the form `as` (the structure it goes into, or
 * `null` for plain), or `null`. In a structure the elements' and the record's own keys are map
 * keys; everything below them, and a plain value as a whole, goes through the encoder.
 */
function storableProblem(key: string, value: unknown, as: StateKeyClass | null): string | null {
  const path = `'${key}'`;
  const seen = new Set<object>();
  if (as === 'elements') {
    const elements = value as PlainObject[];
    for (let i = 0; i < elements.length; i++) {
      const problem = valueProblem(elements[i], `${path}[${i}]`, seen, MAP_KEYS);
      if (problem !== null) return problem;
    }
    return null;
  }
  return valueProblem(value, path, seen, as === 'record' ? MAP_KEYS : PLAIN_VALUE);
}

/** The structure `writeKey` puts `value` into, or `null` when it writes it plain. */
function storageOf(
  current: unknown,
  key: string,
  value: unknown,
  options: StateWriteOptions
): StateKeyClass | null {
  const cls = current instanceof Y.Map ? classOf(current as Y.Map<unknown>) : null;
  if (cls === 'elements' || cls === 'order' || cls === 'record') {
    return representable(cls, value) ? cls : null;
  }
  if (sameStateValue(readValue(current), value)) return null;
  const target = options.classes.get(key);
  return options.lift && target !== undefined && representable(target, value) ? target : null;
}

/**
 * Why `value` cannot be written, or `null`. Checked for every key before the transaction
 * starts, because Yjs has no rollback: a write that threw halfway would leave half of it in the
 * document. `options.lift` must already say whether the document allows structure.
 */
function rejection(
  stateY: Y.Map<unknown> | null,
  key: string,
  value: unknown,
  options: StateWriteOptions
): string | null {
  const current = stateY === null ? undefined : stateY.get(key);
  if (isUnreadable(current)) return `'${key}' holds a structure of a class this build lacks`;
  // A Yjs value first: `storageOf` compares values and must not see one.
  if (value instanceof Y.AbstractType) return `'${key}' is a Yjs value, not plain JSON`;
  return storableProblem(key, value, storageOf(current, key, value, options));
}

/**
 * Throws, naming the first problem, when `writeStateKeys(stateY, partial)` or (without
 * `stateY`) `buildStateMap(partial)` would reject the write; changes nothing. For a caller
 * that writes more than the codec does in one go (it deletes keys, or writes several pages) and
 * must not start when the codec would refuse a part of it.
 */
export function assertWritableState(
  partial: Record<string, unknown>,
  options: StateWriteOptions,
  stateY: Y.Map<unknown> | null = null
): void {
  const effective = effectiveOptions(options, stateY);
  for (const [key, value] of Object.entries(partial)) {
    const reason = rejection(stateY, key, value, effective);
    if (reason !== null) throw new Error(`state write rejected: ${reason}`);
  }
}

/** `options` with `lift` as the document allows it (rule 1); a map outside one cannot say. */
const effectiveOptions = (
  options: StateWriteOptions,
  stateY: Y.Map<unknown> | null
): StateWriteOptions => {
  const doc = stateY?.doc ?? null;
  return doc === null
    ? options
    : { classes: options.classes, lift: options.lift && mayWriteStructured(doc) };
};

/**
 * Write each key of `partial`. A structured key is diffed into its structure (only changed
 * elements, properties, ids and positions are written; a value the structure cannot represent
 * replaces it plain); a plain key is set when its value changed (`sameStateValue`). A key the
 * classes name that is plain or absent is written structured only when `lift` is set, the
 * document allows it (`mayWriteStructured`, read inside the transaction: rule 1, so a caller
 * that stamps version 4 in the same transaction stamps first) and the value changed. Runs in
 * the caller's transaction if there is one, else in its own.
 *
 * Throws, before writing anything, when the map is not part of a document (use
 * `buildStateMap`), when a key of `partial` holds a structure of a class this build does not
 * know (such a document is newer, and writing into it would destroy what a newer client
 * stored), or when a value is not one Yjs stores and decodes unchanged as JSON (`valueProblem`:
 * a Yjs type, a BigInt, a function, a `Date`, a `Map`, a class instance, a cycle, …).
 */
export function writeStateKeys(
  stateY: Y.Map<unknown>,
  partial: Record<string, unknown>,
  options: StateWriteOptions
): void {
  const doc = stateY.doc;
  if (doc === null) {
    throw new Error('writeStateKeys: the state map is not part of a document; use buildStateMap');
  }
  // Read outside our transaction, as the writes below see it: a caller that stamps version 4
  // in its own transaction has stamped already (rule 1).
  const effective = effectiveOptions(options, stateY);
  for (const [key, value] of Object.entries(partial)) {
    const reason = rejection(stateY, key, value, effective);
    if (reason !== null) throw new Error(`writeStateKeys: ${reason}`);
  }
  doc.transact(() => {
    for (const [key, value] of Object.entries(partial)) writeKey(stateY, key, value, effective);
  });
}

/**
 * A fresh, not yet integrated state map holding `state`: each key the classes name structured
 * when `lift` is set and the value is representable, everything else plain. Reads nothing back.
 * Throws, before building anything, for a value `writeStateKeys` would reject.
 */
export function buildStateMap(
  state: Record<string, unknown>,
  options: StateWriteOptions
): Y.Map<unknown> {
  for (const [key, value] of Object.entries(state)) {
    const reason = rejection(null, key, value, options);
    if (reason !== null) throw new Error(`buildStateMap: ${reason}`);
  }
  const stateY = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(state)) {
    const cls = options.classes.get(key);
    stateY.set(
      key,
      options.lift && cls !== undefined && representable(cls, value)
        ? buildStructured(cls, value)
        : value
    );
  }
  return stateY;
}

/** Does the doc's `meta.schemaVersion` allow structured writes (≥ ELEMENT_STORAGE_VERSION)? */
export function mayWriteStructured(doc: Y.Doc): boolean {
  const version = doc.getMap<unknown>(YDOC_KEYS.meta).get(YDOC_KEYS.schemaVersion);
  return Number.isInteger(version) && (version as number) >= ELEMENT_STORAGE_VERSION;
}
