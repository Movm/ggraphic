// SPDX-License-Identifier: MPL-2.0
/**
 * Writes another client's edit into the history snapshots, as if it had always
 * been there (#160). Undo restores whole snapshots; a snapshot taken before
 * the edit would otherwise write the old value back over it, and one taken
 * after would count the edit as this client's own step.
 *
 * Only what the remote edit changed (`prev` → `next`) is touched, and as
 * finely as the state allows: element collections (arrays of objects with an
 * `id`) per element and property, id lists (`layerOrder`, `lockedLayerIds`)
 * per id with their order, records per key, everything else as a whole value.
 * So an own step on another element of the same collection — or on another
 * property of the same element — stays undoable.
 *
 * Where the two meet, this client's own step decides: an element (or id) the
 * snapshot lacks although `prev` has it came with a later own step, so the
 * remote edit does not bring it back — undo of an add removes the element even
 * after someone else touched it. A remote removal still applies.
 *
 * The change is planned once per remote edit (`planHistoryRebase`) and applied
 * per snapshot (`applyHistoryRebase`), which returns the snapshot itself when
 * the change does not reach it.
 */

const jsonEqual = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

type WithId = { id: string };
type Rec = Record<string, unknown>;

const hasId = (value: unknown): value is WithId =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';

const isPlainRecord = (value: unknown): value is Rec =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCollection = (value: unknown): value is WithId[] =>
  Array.isArray(value) && value.every(hasId);

/** Distinct strings whose order may matter (`layerOrder`, `lockedLayerIds`). */
const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((id) => typeof id === 'string') &&
  new Set(value).size === value.length;

/** A key changed from `prev` to `next`; `present: false` means deleted. */
interface FieldChange {
  key: string;
  present: boolean;
  value: unknown;
}

function fieldChanges(prev: Rec, next: Rec): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (jsonEqual(prev[key], next[key])) continue;
    changes.push({ key, present: Object.hasOwn(next, key), value: next[key] });
  }
  return changes;
}

function applyFields(entry: Rec, changes: FieldChange[]): Rec {
  let result: Rec | null = null;
  for (const { key, present, value } of changes) {
    if (present ? jsonEqual(entry[key], value) : !Object.hasOwn(entry, key)) continue;
    result ??= { ...entry };
    if (present) result[key] = value;
    else delete result[key];
  }
  return result ?? entry;
}

interface CollectionPlan {
  key: string;
  kind: 'collection';
  removed: Set<string>;
  changed: Map<string, FieldChange[]>;
  added: { item: WithId; index: number }[];
}

interface IdsPlan {
  key: string;
  kind: 'ids';
  removed: Set<string>;
  moved: Set<string>;
  /** Inserted and moved ids in `next` order, each with the ids after it in `next`. */
  placed: { id: string; following: string[] }[];
}

type KeyPlan =
  | { key: string; kind: 'delete' }
  | { key: string; kind: 'value'; next: unknown }
  | { key: string; kind: 'record'; changes: FieldChange[] }
  | CollectionPlan
  | IdsPlan;

export type HistoryRebase = KeyPlan[];

function planCollection(key: string, prev: WithId[], next: WithId[]): CollectionPlan {
  const before = new Map(prev.map((item) => [item.id, item]));
  const after = new Set(next.map((item) => item.id));
  const changed = new Map<string, FieldChange[]>();
  const added: { item: WithId; index: number }[] = [];
  next.forEach((item, index) => {
    const old = before.get(item.id);
    if (!old) added.push({ item, index });
    else if (!jsonEqual(old, item)) changed.set(item.id, fieldChanges(old as Rec, item as Rec));
  });
  const removed = new Set(prev.filter((item) => !after.has(item.id)).map((item) => item.id));
  return { key, kind: 'collection', removed, changed, added };
}

/** Positions (into `seq`) of one longest increasing subsequence. */
function longestIncreasing(seq: number[]): Set<number> {
  const tails: number[] = [];
  const parent: number[] = [];
  seq.forEach((value, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < value) lo = mid + 1;
      else hi = mid;
    }
    parent[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  });
  const kept = new Set<number>();
  for (let i = tails.length > 0 ? tails[tails.length - 1] : -1; i >= 0; i = parent[i]) kept.add(i);
  return kept;
}

function planIds(key: string, prev: string[], next: string[]): IdsPlan {
  const inNext = new Map(next.map((id, i) => [id, i]));
  const inPrev = new Set(prev);
  const removed = new Set(prev.filter((id) => !inNext.has(id)));
  // Of the ids both sides keep, those off one longest common order are the ones the remote moved.
  const common = prev.filter((id) => inNext.has(id));
  const stay = longestIncreasing(common.map((id) => inNext.get(id)!));
  const moved = new Set(common.filter((_, i) => !stay.has(i)));
  const placed = next.flatMap((id, i) =>
    !inPrev.has(id) || moved.has(id) ? [{ id, following: next.slice(i + 1) }] : []
  );
  return { key, kind: 'ids', removed, moved, placed };
}

/** The remote edit from `prev` to `next`, ready to apply to any number of snapshots. */
export function planHistoryRebase(prev: Rec, next: Rec): HistoryRebase {
  const plan: HistoryRebase = [];
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const before = prev[key];
    const after = next[key];
    if (jsonEqual(before, after)) continue;
    if (!Object.hasOwn(next, key)) plan.push({ key, kind: 'delete' });
    else if (isCollection(after) && (before === undefined || isCollection(before)))
      plan.push(planCollection(key, before ?? [], after));
    else if (isIdList(after) && (before === undefined || isIdList(before)))
      plan.push(planIds(key, before ?? [], after));
    else if (isPlainRecord(before) && isPlainRecord(after))
      plan.push({ key, kind: 'record', changes: fieldChanges(before, after) });
    else plan.push({ key, kind: 'value', next: after });
  }
  return plan;
}

function applyCollection(entry: WithId[], plan: CollectionPlan): WithId[] {
  let changed = false;
  const result: WithId[] = [];
  const at = new Map<string, number>();
  for (const item of entry) {
    if (plan.removed.has(item.id)) {
      changed = true;
      continue;
    }
    const fields = plan.changed.get(item.id);
    const patched = fields ? (applyFields(item as Rec, fields) as WithId) : item;
    if (patched !== item) changed = true;
    at.set(item.id, result.length);
    result.push(patched);
  }
  // Changes to an element this snapshot lacks are skipped above: a later own step added it.
  for (const { item, index } of plan.added) {
    const own = at.get(item.id);
    if (own === undefined) {
      result.splice(Math.min(index, result.length), 0, item);
      changed = true;
    } else if (!jsonEqual(result[own], item)) {
      result[own] = item;
      changed = true;
    }
  }
  return changed ? result : entry;
}

function applyIds(entry: string[], plan: IdsPlan): string[] {
  const had = new Set(entry);
  const result = entry.filter((id) => !plan.removed.has(id) && !plan.moved.has(id));
  for (const { id, following } of plan.placed) {
    // A moved id this snapshot lacks came with a later own step.
    if (plan.moved.has(id) ? !had.has(id) : result.includes(id)) continue;
    const anchor = following.find((other) => result.includes(other));
    result.splice(anchor === undefined ? result.length : result.indexOf(anchor), 0, id);
  }
  return result.length === entry.length && result.every((id, i) => id === entry[i])
    ? entry
    : result;
}

function applyKey(value: unknown, plan: Exclude<KeyPlan, { kind: 'delete' }>): unknown {
  switch (plan.kind) {
    case 'value':
      return jsonEqual(value, plan.next) ? value : plan.next;
    case 'record':
      return applyFields(isPlainRecord(value) ? value : {}, plan.changes);
    case 'collection':
      return isCollection(value) ? applyCollection(value, plan) : value;
    case 'ids':
      return isIdList(value) ? applyIds(value, plan) : value;
  }
}

/** `entry` with the planned change applied; `entry` itself when the change does not reach it. */
export function applyHistoryRebase(entry: Rec, plan: HistoryRebase): Rec {
  let result: Rec | null = null;
  for (const keyPlan of plan) {
    const { key } = keyPlan;
    if (keyPlan.kind === 'delete') {
      if (!Object.hasOwn(entry, key)) continue;
      result ??= { ...entry };
      delete result[key];
      continue;
    }
    const current = entry[key];
    let next: unknown;
    if (current === undefined && (keyPlan.kind === 'collection' || keyPlan.kind === 'ids')) {
      // A list the snapshot lacks: only what the remote edit itself added goes in.
      next = applyKey([], keyPlan);
      if ((next as unknown[]).length === 0) continue;
    } else {
      next = applyKey(current, keyPlan);
    }
    if (next === current) continue;
    result ??= { ...entry };
    result[key] = next;
  }
  return result ?? entry;
}
