import { describe, expect, it } from 'vitest';

import { pageStateFrom } from './pageState';

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
