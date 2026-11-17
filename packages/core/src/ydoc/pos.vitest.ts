// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { isValidPos, posBetween, posJitter } from './pos.js';

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
