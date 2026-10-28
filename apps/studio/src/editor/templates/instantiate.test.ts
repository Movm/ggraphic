// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { catalogTemplate } from './catalog';
import { templatePageState } from './instantiate';

describe('templatePageState', () => {
  it('a template page records its origin and world', () => {
    const state = templatePageState(catalogTemplate('studio-quote')!, 'post-portrait');
    expect(state?.['templateRef']).toEqual({ id: 'studio-quote', version: 1 });
    expect(state?.['brandScheme']).toBe('light');
  });

  it('an unknown template id gives null', () => {
    expect(catalogTemplate('studio-gone')).toBeNull();
  });

  it('a format no template covers gives null', () => {
    expect(templatePageState(catalogTemplate('studio-quote')!, 'story')).toBeNull();
  });
});
