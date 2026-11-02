// SPDX-License-Identifier: MPL-2.0
/**
 * Writes another client's edit into one history snapshot, as if it had always
 * been there (#160). Undo restores whole snapshots; a snapshot taken before
 * the edit would otherwise write the old value back over it, and one taken
 * after would count the edit as this client's own step.
 *
 * Only what the remote edit changed (`prev` → `next`) is touched, and as
 * finely as the state allows: element collections (arrays of objects with an
 * `id`) per element and property, records per key, everything else as a whole
 * value. So an own step on another element of the same collection — or on
 * another property of the same element — stays undoable.
 */

const jsonEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

type WithId = { id: string };

const hasId = (value: unknown): value is WithId =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

/** An element collection: an array whose items all carry a string `id`. */
const isCollection = (value: unknown): value is WithId[] =>
  Array.isArray(value) && value.length > 0 && value.every(hasId);

function rebaseCollection(entry: WithId[], prev: WithId[], next: WithId[]): WithId[] {
  const before = new Map(prev.map((item) => [item.id, item]));
  const after = new Set(next.map((item) => item.id));
  const result = entry.filter((item) => !before.has(item.id) || after.has(item.id));
  next.forEach((item, index) => {
    const old = before.get(item.id);
    if (old && jsonEqual(old, item)) return;
    const at = result.findIndex((own) => own.id === item.id);
    // Per property: the entry keeps what the remote edit left alone on this element.
    if (at >= 0 && old)
      result[at] = rebaseRecord(asRecord(result[at]), asRecord(old), asRecord(item)) as WithId;
    else if (at >= 0) result[at] = item;
    else result.splice(Math.min(index, result.length), 0, item);
  });
  return result;
}

function rebaseRecord(
  entry: Record<string, unknown>,
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...entry };
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (jsonEqual(prev[key], next[key])) continue;
    if (Object.hasOwn(next, key)) result[key] = next[key];
    else delete result[key];
  }
  return result;
}

function rebaseValue(entry: unknown, prev: unknown, next: unknown): unknown {
  const prevItems = Array.isArray(prev) ? prev : [];
  const nextItems = Array.isArray(next) ? next : [];
  if (
    Array.isArray(entry) &&
    (isCollection(prev) || isCollection(next)) &&
    [...prevItems, ...nextItems, ...entry].every(hasId)
  ) {
    return rebaseCollection(entry as WithId[], prevItems as WithId[], nextItems as WithId[]);
  }
  if (isPlainRecord(entry) && isPlainRecord(prev) && isPlainRecord(next)) {
    return rebaseRecord(entry, prev, next);
  }
  return next;
}

/** `entry` with the change from `prev` to `next` applied; `entry` itself is left alone. */
export function rebaseHistoryState(
  entry: Record<string, unknown>,
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...entry };
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (jsonEqual(prev[key], next[key])) continue;
    if (!Object.hasOwn(next, key)) delete result[key];
    else result[key] = rebaseValue(entry[key], prev[key], next[key]);
  }
  return result;
}
