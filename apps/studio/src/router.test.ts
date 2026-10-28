// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { parseRoute } from './router';

describe('parseRoute', () => {
  it('sends removed pages (members, old invitation links) to the start page', () => {
    expect(parseRoute('/members')).toEqual({ name: 'start' });
    expect(parseRoute('/invite/abc')).toEqual({ name: 'start' });
  });
});

describe('parseRoute trash', () => {
  it('knows the trash page', () => {
    expect(parseRoute('/trash')).toEqual({ name: 'trash' });
    expect(parseRoute('/trash/')).toEqual({ name: 'trash' });
  });
});
