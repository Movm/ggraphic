// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import {
  expandToGroups,
  groupOf,
  pruneGroups,
  readGroups,
  remapGroups,
  withoutGroup,
  type PageGroup,
} from './pageGroups.js';

const G1: PageGroup = { id: 'g1', elementIds: ['a', 'b'] };
const G2: PageGroup = {
  id: 'g2',
  blockRef: { id: 'blk', version: 2 },
  elementIds: ['c', 'd', 'e'],
};

describe('readGroups', () => {
  it('reads well-formed groups, keeping the block reference', () => {
    expect(readGroups({ groups: [G1, G2] })).toEqual([G1, G2]);
  });

  it('returns [] when the key is missing or not an array', () => {
    expect(readGroups({})).toEqual([]);
    expect(readGroups({ groups: 'x' })).toEqual([]);
  });

  it('drops entries without an id or with non-string elementIds', () => {
    const state = {
      groups: [
        G1,
        { elementIds: ['a', 'b'] },
        { id: '', elementIds: ['a', 'b'] },
        { id: 'bad', elementIds: ['a', 2] },
        { id: 'bad2', elementIds: 'ab' },
        null,
        42,
      ],
    };
    expect(readGroups(state)).toEqual([G1]);
  });

  it('ignores a malformed blockRef instead of dropping the group', () => {
    expect(
      readGroups({ groups: [{ id: 'g', blockRef: { id: 1 }, elementIds: ['a', 'b'] }] })
    ).toEqual([{ id: 'g', elementIds: ['a', 'b'] }]);
  });
});

describe('groupOf', () => {
  it('finds the group holding the element', () => {
    expect(groupOf([G1, G2], 'd')).toBe(G2);
  });
  it('returns null for an ungrouped element', () => {
    expect(groupOf([G1, G2], 'z')).toBeNull();
  });
});

describe('expandToGroups', () => {
  it('adds the other members, keeping order and uniqueness', () => {
    expect(expandToGroups([G1, G2], ['z', 'b'])).toEqual(['z', 'b', 'a']);
    expect(expandToGroups([G1, G2], ['a', 'b'])).toEqual(['a', 'b']);
  });
  it('returns ungrouped ids unchanged', () => {
    expect(expandToGroups([G1], ['x', 'y'])).toEqual(['x', 'y']);
  });
});

describe('pruneGroups', () => {
  it('removes missing members', () => {
    expect(pruneGroups([G2], new Set(['c', 'd']))).toEqual([{ ...G2, elementIds: ['c', 'd'] }]);
  });
  it('dissolves a group left with one member', () => {
    expect(pruneGroups([G1, G2], new Set(['a', 'c', 'd', 'e']))).toEqual([G2]);
  });
  it('returns the same array when nothing changes', () => {
    const groups = [G1, G2];
    expect(pruneGroups(groups, new Set(['a', 'b', 'c', 'd', 'e', 'x']))).toBe(groups);
  });
});

describe('withoutGroup', () => {
  it('drops the group by id', () => {
    expect(withoutGroup([G1, G2], 'g1')).toEqual([G2]);
  });
});

describe('remapGroups', () => {
  it('maps member ids and keeps group ids and block refs', () => {
    const map = new Map([
      ['a', 'a2'],
      ['b', 'b2'],
    ]);
    expect(remapGroups([G1, G2], map)).toEqual([{ id: 'g1', elementIds: ['a2', 'b2'] }, G2]);
  });
});
