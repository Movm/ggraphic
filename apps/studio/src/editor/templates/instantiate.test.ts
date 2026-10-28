// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { catalogTemplate } from './catalog';
import { seedFor } from './seeds';
import { templatePageState } from './instantiate';

describe('templatePageState', () => {
  it('a template page records its origin and world', () => {
    const state = templatePageState(catalogTemplate('studio-quote')!, 'post-portrait');
    expect(state?.['templateRef']).toEqual({ id: 'studio-quote', version: 1 });
    expect(state?.['brandScheme']).toBe('light');
  });

  it('an unknown template id gives no page', () => {
    const entry = catalogTemplate('studio-gone');
    expect(entry).toBeNull();
    expect(seedFor('studio-gone', 1080, 1350)).toEqual({});
    expect(entry && templatePageState(entry, 'post-portrait')).toBeNull();
  });

  it('a format no template covers gives null', () => {
    expect(templatePageState(catalogTemplate('studio-quote')!, 'story')).toBeNull();
  });
});
