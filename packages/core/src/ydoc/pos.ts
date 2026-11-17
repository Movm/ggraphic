// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Fractional order keys: the order of pages in a Y.Doc (`pos` on each page map), of the
 * elements of a structured collection (`$pos`) and of the ids of an `order` value. Keys compare
 * as plain strings; ties are broken by id. Moving an item writes one key, so the item keeps its
 * identity. The alphabet and the format are stored in documents (F0).
 */

/** ASCII-ordered, so plain string comparison sorts correctly. F0. */
const POS_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Is `key` a key `posBetween` can mint and bound: non-empty, only alphabet characters, not
 * ending in the smallest digit. A stored key of any other form (written by a foreign writer,
 * or corrupt) still sorts as a plain string on read, but a writer must not use it as a bound:
 * `posBetween(null, '0')` has no answer inside the bounds.
 */
export const isValidPos = (key: unknown): key is string =>
  typeof key === 'string' && /^[0-9A-Za-z]*[1-9A-Za-z]$/.test(key);

/**
 * A key strictly between `a` and `b` (lexicographic). `null` means unbounded.
 * Generated keys never end in the smallest digit ('0'), which guarantees a
 * midpoint always exists between any two previously generated keys.
 */
export function posBetween(a: string | null, b: string | null): string {
  const lo = a ?? '';
  const hi = b ?? '';
  if (lo !== '' && hi !== '' && lo >= hi) {
    throw new Error(`posBetween: '${lo}' >= '${hi}'`);
  }
  let result = '';
  for (let i = 0; ; i++) {
    const ca = i < lo.length ? POS_ALPHABET.indexOf(lo[i]!) : 0;
    const cb = i < hi.length ? POS_ALPHABET.indexOf(hi[i]!) : POS_ALPHABET.length;
    if (cb - ca > 1) {
      return result + POS_ALPHABET[ca + Math.ceil((cb - ca) / 2)]!;
    }
    result += POS_ALPHABET[ca]!;
  }
}

const randomDigit = (): string =>
  POS_ALPHABET[1 + Math.floor(Math.random() * (POS_ALPHABET.length - 1))]!;

/**
 * Random suffix for user-initiated pos keys. posBetween is deterministic, so
 * two clients concurrently appending after the same last item would mint the
 * SAME pos for different ids — a tie posBetween can never split again. Two
 * random non-'0' chars make that practically impossible while preserving
 * strict betweenness (appending to a between-key keeps it between, given the
 * no-trailing-'0' invariant). Seeds and lifts stay deterministic on purpose —
 * identical racing seeds must converge, and ties across identical ids merge anyway.
 */
export const posJitter = (pos: string): string => pos + randomDigit() + randomDigit();
