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

const BASE = BigInt(POS_ALPHABET.length);

/** `key` read as a base-62 number of exactly `width` digits, padded with the smallest digit. */
function toNumber(key: string, width: number): bigint {
  let n = 0n;
  for (let i = 0; i < width; i++) {
    n = n * BASE + BigInt(i < key.length ? POS_ALPHABET.indexOf(key[i]!) : 0);
  }
  return n;
}

function toKey(n: bigint, width: number): string {
  let key = '';
  for (let i = 0; i < width; i++) {
    key = POS_ALPHABET[Number(n % BASE)]! + key;
    n /= BASE;
  }
  return key;
}

/**
 * `count` keys strictly between `a` and `b` (`null` = unbounded), ascending and spread evenly
 * over the gap, at the shortest width where the gap holds them with a spacing of at least two
 * (one key is `posBetween(a, b)`, the shortest there is).
 * All have that width and none ends in the smallest digit. Their length grows with the
 * logarithm of `count` (5,000 keys in an open gap are three characters), where a chain of
 * `posBetween(previous, b)` grows linearly. Deterministic. Like a `posBetween` key, each stays
 * between its neighbours and `b` when `posJitter` is appended: it is no prefix of either, being
 * as wide as its neighbours and at least as long as `b`.
 */
export function posRange(a: string | null, b: string | null, count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [posBetween(a, b)];
  const lo = a ?? '';
  const hi = b ?? '';
  if (lo !== '' && hi !== '' && lo >= hi) {
    throw new Error(`posRange: '${lo}' >= '${hi}'`);
  }
  const slots = BigInt(count + 1);
  for (let width = Math.max(lo.length, hi.length, 1); ; width++) {
    const start = toNumber(lo, width);
    const end = hi === '' ? BASE ** BigInt(width) : toNumber(hi, width);
    const step = (end - start) / slots;
    if (step < 2n) continue;
    const keys: string[] = [];
    for (let i = 1n; i < slots; i++) {
      const n = start + i * step;
      // The spacing of at least two leaves room to step off a trailing smallest digit.
      keys.push(toKey(n % BASE === 0n ? n + 1n : n, width));
    }
    return keys;
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
