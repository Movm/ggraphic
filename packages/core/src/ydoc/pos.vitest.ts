// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { isValidPos, posBetween, posJitter, posRange } from './pos.js';

describe('posBetween', () => {
  it('produces keys strictly between the bounds', () => {
    const mid = posBetween(null, null);
    expect(posBetween(null, mid) < mid).toBe(true);
    expect(posBetween(mid, null) > mid).toBe(true);
  });

  it('never ends in the smallest digit', () => {
    let lo: string | null = null;
    for (let i = 0; i < 100; i++) {
      const key: string = posBetween(lo, null);
      expect(key.endsWith('0')).toBe(false);
      lo = key;
    }
  });

  it('always finds a midpoint between adjacent generated keys', () => {
    // Repeatedly bisect the same interval — the pathological case for
    // fractional indexing.
    let lo = posBetween(null, null);
    let hi = posBetween(lo, null);
    for (let i = 0; i < 50; i++) {
      const mid = posBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      if (i % 2 === 0) lo = mid;
      else hi = mid;
    }
  });

  it('throws on inverted bounds', () => {
    expect(() => posBetween('b', 'a')).toThrow();
  });

  it('grows the deterministic chain by about one character per six entries', () => {
    let pos: string | null = null;
    for (let i = 0; i < 100; i++) pos = posBetween(pos, null);
    expect(pos!.length).toBeLessThanOrEqual(20);
  });
});

describe('posJitter', () => {
  it('appends two digits other than the smallest and keeps the key between its bounds', () => {
    for (let i = 0; i < 200; i++) {
      const lo = posBetween(null, null);
      const hi = posBetween(lo, null);
      const key = posJitter(posBetween(lo, hi));
      expect(key).toMatch(/^[0-9A-Za-z]+[1-9A-Za-z]{2}$/);
      expect(lo < key && key < hi).toBe(true);
      expect(key.endsWith('0')).toBe(false);
    }
  });

  it('makes two keys minted for the same gap differ', () => {
    const base = posBetween(null, null);
    const keys = new Set(Array.from({ length: 50 }, () => posJitter(base)));
    expect(keys.size).toBeGreaterThan(45);
  });
});

describe('isValidPos', () => {
  it('accepts what posBetween mints and rejects what it cannot bound', () => {
    let pos: string | null = null;
    for (let i = 0; i < 50; i++) {
      pos = posJitter(posBetween(pos, null));
      expect(isValidPos(pos)).toBe(true);
    }
    for (const bad of ['', '0', 'A0', '-', 'a.b', 'ä', 7, null, undefined]) {
      expect(isValidPos(bad)).toBe(false);
    }
  });
});

describe('posRange', () => {
  const ascending = (keys: readonly string[]) => keys.every((k, i) => i === 0 || keys[i - 1]! < k);

  it.each([
    ['an open gap', null, null],
    ['below a key', null, 'V'],
    ['above a key', 'V', null],
    ['between adjacent keys', 'V', 'W'],
    ['between keys of different length', 'V', 'VV'],
    ['between long keys', 'abcdefgh', 'abcdefgz'],
  ])('mints valid ascending keys strictly inside %s', (_name, a, b) => {
    for (const count of [2, 3, 61, 62, 63, 500, 4000]) {
      const keys = posRange(a, b, count);
      expect(keys).toHaveLength(count);
      expect(ascending(keys)).toBe(true);
      expect(keys.every(isValidPos)).toBe(true);
      if (a !== null) expect(a < keys[0]!).toBe(true);
      if (b !== null) expect(keys[count - 1]! < b).toBe(true);
    }
  });

  it('keeps every key between its neighbours and the bound when jittered', () => {
    for (const [a, b] of [
      [null, null],
      ['V', 'VV'],
      ['V', 'W'],
    ] as const) {
      const keys = posRange(a, b, 300);
      const jittered = keys.map(posJitter);
      for (let i = 0; i < keys.length; i++) {
        expect(keys[i]! < jittered[i]!).toBe(true);
        expect(jittered[i]! < (keys[i + 1] ?? b ?? '\uffff')).toBe(true);
      }
    }
  });

  it('grows with the logarithm of the count, not linearly', () => {
    expect(Math.max(...posRange(null, null, 100).map((k) => k.length))).toBe(2);
    expect(Math.max(...posRange(null, null, 5000).map((k) => k.length))).toBe(3);
    expect(Math.max(...posRange('V', 'W', 500).map((k) => k.length))).toBe(3);
  });

  it('is posBetween for one key and empty for none', () => {
    expect(posRange(null, null, 1)).toEqual([posBetween(null, null)]);
    expect(posRange('V', 'W', 1)).toEqual([posBetween('V', 'W')]);
    expect(posRange(null, null, 0)).toEqual([]);
  });

  it('is deterministic and throws on inverted bounds', () => {
    expect(posRange('A', 'z', 50)).toEqual(posRange('A', 'z', 50));
    expect(() => posRange('b', 'a', 2)).toThrow();
  });
});
