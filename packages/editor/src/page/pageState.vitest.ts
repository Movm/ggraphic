// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { pageStateFrom } from './pageState.js';

describe('pageStateFrom brand keys', () => {
  it('reads bind, brandScheme and brandStamp back, so a re-seed keeps them', () => {
    const bind = { backgroundColor: { ref: 'surface', value: '#ffffff' } };
    const state = pageStateFrom(
      { additionalTexts: [], bind, brandScheme: 'light', brandStamp: 'a1b2c3d4' },
      {}
    );
    expect(state.bind).toEqual(bind);
    expect(state.brandScheme).toBe('light');
    expect(state.brandStamp).toBe('a1b2c3d4');
  });

  it('adds no brand keys to a page that has none', () => {
    const state = pageStateFrom({ additionalTexts: [] }, {});
    expect(state).not.toHaveProperty('bind');
    expect(state).not.toHaveProperty('brandScheme');
    expect(state).not.toHaveProperty('brandStamp');
  });
});

describe('pageStateFrom template keys', () => {
  it('keeps templateRef and groups across a re-seed and drops malformed ones', () => {
    const groups = [{ id: 'g1', elementIds: ['a', 'b'] }];
    const kept = pageStateFrom(
      { additionalTexts: [], templateRef: { id: 't', version: 2 }, groups },
      {}
    );
    expect(kept.templateRef).toEqual({ id: 't', version: 2 });
    expect(kept.groups).toEqual(groups);

    for (const templateRef of [
      { id: 1, version: 1 },
      { id: 't', version: 0 },
      { id: 't', version: 1.5 },
      'x',
      null,
    ]) {
      expect(pageStateFrom({ additionalTexts: [], templateRef }, {})).not.toHaveProperty(
        'templateRef'
      );
    }
    expect(pageStateFrom({ additionalTexts: [], groups: 'g' }, {})).not.toHaveProperty('groups');
    const mixed = pageStateFrom(
      { additionalTexts: [], groups: [groups[0], { id: 1 }, null, { id: 'g2', elementIds: 'x' }] },
      {}
    );
    expect(mixed.groups).toEqual(groups);
  });
});
